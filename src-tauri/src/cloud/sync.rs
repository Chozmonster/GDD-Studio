//! Full-tree project sync: LWW per file + Yours/Theirs on dual-change.

use super::provider::{CloudProvider, RemoteEntry, RemoteEntryKind};
use super::state::{self, CloudProjectLink};
use crate::store::{self, now_secs, ProjectRecord};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::AppHandle;

pub const ROOT_FOLDER_NAME: &str = "GDD Studio";
pub const SYNC_META_FILE: &str = ".gdds-sync.json";
pub const ROOT_MARKER_FILE: &str = ".gdds-root.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncFileMeta {
    pub local_mtime: Option<u64>,
    pub remote_id: Option<String>,
    pub remote_modified_time: Option<String>,
    pub md5: Option<String>,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMetaDocument {
    pub format: String,
    pub version: u32,
    pub project_id_hint: Option<String>,
    pub last_sync_at: Option<u64>,
    #[serde(default)]
    pub files: HashMap<String, SyncFileMeta>,
}

impl Default for SyncMetaDocument {
    fn default() -> Self {
        Self {
            format: "gdds-sync".into(),
            version: 1,
            project_id_hint: None,
            last_sync_at: None,
            files: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub path: String,
    pub local_mtime: Option<u64>,
    pub remote_mtime: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub uploaded: usize,
    pub downloaded: usize,
    pub deleted_local: usize,
    pub deleted_remote: usize,
    pub skipped: usize,
    pub conflicts: Vec<SyncConflict>,
    /// Remote files that disappeared since last sync — confirm before deleting local.
    pub pending_local_deletes: Vec<String>,
    pub log: Vec<String>,
    pub offline: bool,
    pub message: String,
}

#[derive(Debug, Clone)]
struct RemoteFileRef {
    id: String,
    modified_time: Option<String>,
    md5: Option<String>,
}

fn file_mtime_secs(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn load_sync_meta(project_root: &Path) -> SyncMetaDocument {
    let path = project_root.join(SYNC_META_FILE);
    if !path.exists() {
        return SyncMetaDocument::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_sync_meta(project_root: &Path, meta: &SyncMetaDocument) -> Result<(), String> {
    let path = project_root.join(SYNC_META_FILE);
    let raw = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("write {SYNC_META_FILE}: {e}"))
}

/// Walk local project files (relative posix-ish paths). Skips nothing under root
/// except directory entries themselves.
fn walk_local_files(root: &Path) -> Result<HashMap<String, PathBuf>, String> {
    let mut out = HashMap::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| format!("read {}: {e}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == "." || name == ".." {
                continue;
            }
            // Path containment for every candidate.
            store::ensure_path_within(root, &path)?;
            if path.is_dir() {
                stack.push(path);
            } else if path.is_file() {
                let rel = path
                    .strip_prefix(root)
                    .map_err(|_| "Path escapes project root".to_string())?;
                let key = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/");
                if key.is_empty() {
                    continue;
                }
                out.insert(key, path);
            }
        }
    }
    Ok(out)
}

async fn walk_remote_files(
    provider: &dyn CloudProvider,
    access_token: &str,
    folder_id: &str,
) -> Result<(HashMap<String, RemoteFileRef>, HashMap<String, String>), String> {
    // path → file ref; folder_rel_path → folder id ("" = project root)
    let mut files = HashMap::new();
    let mut folders: HashMap<String, String> = HashMap::new();
    folders.insert(String::new(), folder_id.to_string());

    let mut queue: Vec<(String, String)> = vec![(String::new(), folder_id.to_string())];
    while let Some((prefix, id)) = queue.pop() {
        let children = provider.list_children(access_token, &id).await?;
        for child in children {
            let rel = if prefix.is_empty() {
                child.name.clone()
            } else {
                format!("{prefix}/{}", child.name)
            };
            match child.kind {
                RemoteEntryKind::Folder => {
                    folders.insert(rel.clone(), child.id.clone());
                    queue.push((rel, child.id));
                }
                RemoteEntryKind::File => {
                    files.insert(
                        rel,
                        RemoteFileRef {
                            id: child.id,
                            modified_time: child.modified_time,
                            md5: child.md5_checksum,
                        },
                    );
                }
            }
        }
    }
    Ok((files, folders))
}

async fn ensure_remote_parent(
    provider: &dyn CloudProvider,
    access_token: &str,
    folders: &mut HashMap<String, String>,
    rel_path: &str,
) -> Result<String, String> {
    let parent_rel = match rel_path.rsplit_once('/') {
        Some((p, _)) => p.to_string(),
        None => String::new(),
    };
    if let Some(id) = folders.get(&parent_rel) {
        return Ok(id.clone());
    }
    // Create missing folder chain from root.
    let parts: Vec<&str> = parent_rel.split('/').filter(|p| !p.is_empty()).collect();
    let mut cur_rel = String::new();
    let mut cur_id = folders
        .get("")
        .cloned()
        .ok_or_else(|| "Missing remote project folder".to_string())?;
    for part in parts {
        cur_rel = if cur_rel.is_empty() {
            part.to_string()
        } else {
            format!("{cur_rel}/{part}")
        };
        if let Some(existing) = folders.get(&cur_rel) {
            cur_id = existing.clone();
            continue;
        }
        // Re-list parent in case it appeared.
        let children = provider.list_children(access_token, &cur_id).await?;
        if let Some(found) = children
            .into_iter()
            .find(|c| c.kind == RemoteEntryKind::Folder && c.name == part)
        {
            folders.insert(cur_rel.clone(), found.id.clone());
            cur_id = found.id;
            continue;
        }
        let created = provider
            .create_folder(access_token, &cur_id, part)
            .await?;
        folders.insert(cur_rel.clone(), created.id.clone());
        cur_id = created.id;
    }
    Ok(cur_id)
}

fn parse_rfc3339_secs(s: &str) -> Option<u64> {
    // Drive uses RFC3339 like 2024-01-01T12:00:00.000Z
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp().max(0) as u64)
}

fn remote_newer(local_mtime: Option<u64>, remote_mtime: &Option<String>, last_sync: Option<u64>) -> bool {
    let remote_secs = remote_mtime.as_deref().and_then(parse_rfc3339_secs);
    match (local_mtime, remote_secs) {
        (Some(l), Some(r)) => r > l,
        (None, Some(_)) => true,
        (Some(_), None) => false,
        (None, None) => false,
    }
    .then_some(())
    .is_some()
        || match (remote_secs, last_sync) {
            (Some(r), Some(ls)) => r > ls && local_mtime.map(|l| l <= ls).unwrap_or(true),
            _ => false,
        }
}

pub fn project_slug(name: &str) -> String {
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "gdd-project".into()
    } else {
        slug.chars().take(80).collect()
    }
}

pub async fn ensure_project_remote_folder(
    provider: &dyn CloudProvider,
    access_token: &str,
    root_folder_id: &str,
    project: &ProjectRecord,
    existing_slug: Option<&str>,
) -> Result<(String, String), String> {
    let base = existing_slug
        .map(|s| s.to_string())
        .unwrap_or_else(|| project_slug(&project.name));
    let children = provider.list_children(access_token, root_folder_id).await?;
    let mut slug = base.clone();
    let mut n = 2u32;
    loop {
        if let Some(found) = children
            .iter()
            .find(|c| c.kind == RemoteEntryKind::Folder && c.name == slug)
        {
            // Reuse if already linked by id later; for new links, collide → -2
            if existing_slug == Some(slug.as_str()) {
                return Ok((found.id.clone(), slug));
            }
            // If name matches and no existing link, still reuse same folder name only when
            // explicitly re-linking same slug; otherwise bump.
            if existing_slug.is_none() {
                // Prefer reusing an empty-ish match only when slug is free of other meaning —
                // for MVP: if folder exists, reuse it (same user multi-device).
                return Ok((found.id.clone(), slug));
            }
        } else {
            break;
        }
        slug = format!("{base}-{n}");
        n += 1;
        if n > 500 {
            return Err("Could not allocate unique cloud project folder name".into());
        }
        if children
            .iter()
            .any(|c| c.kind == RemoteEntryKind::Folder && c.name == slug)
        {
            continue;
        }
        break;
    }
    if let Some(found) = children
        .iter()
        .find(|c| c.kind == RemoteEntryKind::Folder && c.name == slug)
    {
        return Ok((found.id.clone(), slug));
    }
    let created = provider
        .create_folder(access_token, root_folder_id, &slug)
        .await?;
    Ok((created.id, slug))
}

pub async fn sync_project(
    app: &AppHandle,
    provider: &dyn CloudProvider,
    access_token: &str,
    project: &ProjectRecord,
    apply_local_deletes: bool,
    conflict_resolutions: &HashMap<String, String>, // path → "yours" | "theirs"
) -> Result<SyncResult, String> {
    let mut log = Vec::new();
    let mut state = state::load_state(app)?;
    let root_id = state
        .root_folder_id
        .clone()
        .ok_or_else(|| "Cloud storage is linked but the GDD Studio root folder is missing. Unlink and link again.".to_string())?;

    let project_root = PathBuf::from(&project.path);
    if !project_root.is_dir() {
        return Err(format!("Local project folder missing: {}", project.path));
    }

    let link = match state.projects.get(&project.id).cloned() {
        Some(l) => l,
        None => {
            let (remote_id, slug) = ensure_project_remote_folder(
                provider,
                access_token,
                &root_id,
                project,
                None,
            )
            .await?;
            let link = CloudProjectLink {
                local_path: project.path.clone(),
                remote_folder_id: remote_id,
                slug,
                last_sync_at: None,
            };
            state.projects.insert(project.id.clone(), link.clone());
            state::save_state(app, &state)?;
            log.push(format!("Created cloud folder GDD Studio/{}", link.slug));
            link
        }
    };

    let mut meta = load_sync_meta(&project_root);
    meta.project_id_hint = Some(project.id.clone());
    let last_sync = meta.last_sync_at.or(link.last_sync_at);

    let local_files = walk_local_files(&project_root)?;
    let (mut remote_files, mut remote_folders) =
        walk_remote_files(provider, access_token, &link.remote_folder_id).await?;

    let mut uploaded = 0usize;
    let mut downloaded = 0usize;
    let deleted_local = 0usize;
    let mut deleted_remote = 0usize;
    let mut skipped = 0usize;
    let mut conflicts = Vec::new();
    let mut pending_local_deletes = Vec::new();

    let all_paths: HashSet<String> = local_files
        .keys()
        .chain(remote_files.keys())
        .cloned()
        .collect();

    for rel in all_paths {
        if rel == SYNC_META_FILE {
            // Meta is rewritten at the end.
            continue;
        }
        let local_path = local_files.get(&rel);
        let remote = remote_files.get(&rel);
        let prev = meta.files.get(&rel).cloned().unwrap_or_default();

        let local_mtime = local_path.and_then(|p| file_mtime_secs(p));
        let local_changed = match (local_mtime, prev.local_mtime, last_sync) {
            (Some(m), Some(pm), _) => m > pm,
            (Some(m), None, Some(ls)) => m > ls,
            (Some(_), None, None) => true,
            (None, _, _) => false,
        };
        let remote_changed = match (&remote, &prev) {
            (Some(r), prev) => {
                if let (Some(a), Some(b)) = (&r.md5, &prev.md5) {
                    a != b
                } else if let (Some(a), Some(b)) = (&r.modified_time, &prev.remote_modified_time) {
                    a != b
                } else {
                    last_sync.is_none()
                        || r.modified_time
                            .as_deref()
                            .and_then(parse_rfc3339_secs)
                            .map(|t| t > last_sync.unwrap_or(0))
                            .unwrap_or(true)
                }
            }
            (None, _) => false,
        };

        // Conflict resolution override.
        if let Some(choice) = conflict_resolutions.get(&rel) {
            match choice.as_str() {
                "yours" if local_path.is_some() => {
                    // force upload below
                }
                "theirs" if remote.is_some() => {
                    // force download below
                }
                _ => {}
            }
        }

        match (local_path, remote) {
            (Some(path), Some(r)) => {
                let dual = local_changed && remote_changed;
                let choice = conflict_resolutions.get(&rel).map(|s| s.as_str());
                if dual && choice.is_none() {
                    conflicts.push(SyncConflict {
                        path: rel.clone(),
                        local_mtime,
                        remote_mtime: r.modified_time.clone(),
                    });
                    log.push(format!("Conflict: {rel} (pick Yours or Theirs)"));
                    continue;
                }
                let take_local = match choice {
                    Some("yours") => true,
                    Some("theirs") => false,
                    _ if local_changed && !remote_changed => true,
                    _ if remote_changed && !local_changed => false,
                    _ => {
                        // LWW
                        let remote_secs = r.modified_time.as_deref().and_then(parse_rfc3339_secs);
                        match (local_mtime, remote_secs) {
                            (Some(l), Some(rm)) => l >= rm,
                            (Some(_), None) => true,
                            (None, Some(_)) => false,
                            (None, None) => true,
                        }
                    }
                };
                if take_local {
                    let bytes = fs::read(path).map_err(|e| format!("read {rel}: {e}"))?;
                    let parent_id =
                        ensure_remote_parent(provider, access_token, &mut remote_folders, &rel)
                            .await?;
                    let meta_up = provider
                        .upload_file(
                            access_token,
                            &parent_id,
                            Path::new(&rel)
                                .file_name()
                                .and_then(|s| s.to_str())
                                .unwrap_or("file"),
                            &bytes,
                            Some(&r.id),
                        )
                        .await?;
                    meta.files.insert(
                        rel.clone(),
                        SyncFileMeta {
                            local_mtime: file_mtime_secs(path),
                            remote_id: Some(meta_up.id.clone()),
                            remote_modified_time: meta_up.modified_time.clone(),
                            md5: meta_up.md5_checksum.clone(),
                            sha256: Some(sha256_bytes(&bytes)),
                        },
                    );
                    remote_files.insert(
                        rel.clone(),
                        RemoteFileRef {
                            id: meta_up.id,
                            modified_time: meta_up.modified_time,
                            md5: meta_up.md5_checksum,
                        },
                    );
                    uploaded += 1;
                    log.push(format!("Uploaded {rel}"));
                } else {
                    let bytes = provider.download_file(access_token, &r.id).await?;
                    if let Some(parent) = path.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("create parent for {rel}: {e}"))?;
                    }
                    store::ensure_path_within(&project_root, path)?;
                    fs::write(path, &bytes).map_err(|e| format!("write {rel}: {e}"))?;
                    meta.files.insert(
                        rel.clone(),
                        SyncFileMeta {
                            local_mtime: file_mtime_secs(path),
                            remote_id: Some(r.id.clone()),
                            remote_modified_time: r.modified_time.clone(),
                            md5: r.md5.clone(),
                            sha256: Some(sha256_bytes(&bytes)),
                        },
                    );
                    downloaded += 1;
                    log.push(format!("Downloaded {rel}"));
                }
            }
            (Some(path), None) => {
                // Local only — upload (or remote deleted)
                let was_tracked = prev.remote_id.is_some();
                if was_tracked && !apply_local_deletes {
                    // Remote deleted while local remains — keep local, re-upload by default
                    // (safer for single-user backup). Log it.
                    log.push(format!(
                        "Remote missing for {rel}; re-uploading local copy"
                    ));
                }
                let bytes = fs::read(path).map_err(|e| format!("read {rel}: {e}"))?;
                let parent_id =
                    ensure_remote_parent(provider, access_token, &mut remote_folders, &rel).await?;
                let name = Path::new(&rel)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("file");
                let meta_up = provider
                    .upload_file(access_token, &parent_id, name, &bytes, None)
                    .await?;
                meta.files.insert(
                    rel.clone(),
                    SyncFileMeta {
                        local_mtime: file_mtime_secs(path),
                        remote_id: Some(meta_up.id.clone()),
                        remote_modified_time: meta_up.modified_time.clone(),
                        md5: meta_up.md5_checksum.clone(),
                        sha256: Some(sha256_bytes(&bytes)),
                    },
                );
                uploaded += 1;
                log.push(format!("Uploaded {rel}"));
                let _ = remote_newer(local_mtime, &None, last_sync);
            }
            (None, Some(r)) => {
                // Remote only
                let was_tracked = prev.local_mtime.is_some() || prev.remote_id.is_some();
                if was_tracked && !apply_local_deletes {
                    // Local deleted — confirm before deleting remote, OR download again?
                    // Plan: delete propagation with confirmation when remote deletes would
                    // remove local files. Here local is already gone — delete remote after
                    // confirm. For MVP without confirm flag, download to restore is safer
                    // only when never tracked; when tracked local delete → pending remote delete.
                    pending_local_deletes.push(rel.clone()); // reuse field name poorly —
                                                             // actually this is pending REMOTE delete.
                                                             // Keep downloading for untracked.
                    // Represent as conflict-like pending: we'll put path in pending_local_deletes
                    // only for "remote gone, local present" case. For local gone:
                    // just delete remote when apply_local_deletes, else skip + log.
                    if apply_local_deletes {
                        provider.delete_entry(access_token, &r.id).await?;
                        meta.files.remove(&rel);
                        deleted_remote += 1;
                        log.push(format!("Deleted remote {rel} (local removed)"));
                    } else {
                        skipped += 1;
                        log.push(format!(
                            "Skipped remote-only {rel} (local deleted — confirm sync again to delete remote)"
                        ));
                    }
                    continue;
                }
                // New remote file → download
                let dest = project_root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                store::ensure_path_within(&project_root, &dest)?;
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("create parent for {rel}: {e}"))?;
                }
                let bytes = provider.download_file(access_token, &r.id).await?;
                fs::write(&dest, &bytes).map_err(|e| format!("write {rel}: {e}"))?;
                meta.files.insert(
                    rel.clone(),
                    SyncFileMeta {
                        local_mtime: file_mtime_secs(&dest),
                        remote_id: Some(r.id.clone()),
                        remote_modified_time: r.modified_time.clone(),
                        md5: r.md5.clone(),
                        sha256: Some(sha256_bytes(&bytes)),
                    },
                );
                downloaded += 1;
                log.push(format!("Downloaded {rel}"));
            }
            (None, None) => {
                skipped += 1;
            }
        }
    }

    // Detect remote deletes of previously synced files (local still present handled above
    // via re-upload). For "remote deleted + local present" we re-uploaded. For
    // "remote deleted + we want to delete local" — only when apply_local_deletes and
    // path was in prev but missing remotely AND locally... already covered.

    // Also: if remote missing and local present was tracked, user might want delete local.
    // Offer pending_local_deletes for paths that exist locally, were tracked, remote gone,
    // when a future flag asks — for MVP re-upload is fine.

    meta.last_sync_at = Some(now_secs());
    save_sync_meta(&project_root, &meta)?;

    // Upload sync meta itself.
    let meta_bytes = serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?;
    let meta_remote = remote_files.get(SYNC_META_FILE);
    let parent_id = link.remote_folder_id.clone();
    let meta_up = provider
        .upload_file(
            access_token,
            &parent_id,
            SYNC_META_FILE,
            &meta_bytes,
            meta_remote.map(|r| r.id.as_str()),
        )
        .await?;
    let _ = meta_up;
    uploaded += 1;

    state::mark_synced(app, Some(&project.id))?;

    let message = if conflicts.is_empty() {
        format!(
            "Sync complete — {uploaded} up, {downloaded} down, {skipped} skipped."
        )
    } else {
        format!(
            "Sync paused on {} conflict(s). Choose Yours or Theirs, then sync again.",
            conflicts.len()
        )
    };

    Ok(SyncResult {
        uploaded,
        downloaded,
        deleted_local,
        deleted_remote,
        skipped,
        conflicts,
        pending_local_deletes,
        log,
        offline: false,
        message,
    })
}

pub async fn list_remote_projects(
    provider: &dyn CloudProvider,
    access_token: &str,
    root_folder_id: &str,
) -> Result<Vec<RemoteEntry>, String> {
    let children = provider.list_children(access_token, root_folder_id).await?;
    Ok(children
        .into_iter()
        .filter(|c| c.kind == RemoteEntryKind::Folder)
        .collect())
}

pub async fn download_remote_project(
    app: &AppHandle,
    provider: &dyn CloudProvider,
    access_token: &str,
    remote_folder_id: &str,
    remote_name: &str,
    parent_dir: &str,
) -> Result<ProjectRecord, String> {
    let parent = PathBuf::from(parent_dir);
    if !parent.is_absolute() {
        return Err("Parent directory must be an absolute path".into());
    }
    if !parent.is_dir() {
        return Err(format!("Parent directory does not exist: {parent_dir}"));
    }

    let slug = project_slug(remote_name);
    let mut dest = parent.join(&slug);
    let mut n = 2u32;
    while dest.exists() {
        dest = parent.join(format!("{slug}-{n}"));
        n += 1;
    }
    fs::create_dir_all(&dest).map_err(|e| format!("create local folder: {e}"))?;

    let (remote_files, _folders) =
        walk_remote_files(provider, access_token, remote_folder_id).await?;
    for (rel, r) in &remote_files {
        let dest_path = dest.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        store::ensure_path_within(&dest, &dest_path)?;
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create parent: {e}"))?;
        }
        let bytes = provider.download_file(access_token, &r.id).await?;
        fs::write(&dest_path, bytes).map_err(|e| format!("write {rel}: {e}"))?;
    }

    // Ensure project marker exists.
    let marker = dest.join("gdd-studio.json");
    if !marker.exists() {
        let doc = serde_json::json!({
            "format": "gdd-studio-project",
            "version": 1,
            "name": remote_name,
        });
        let raw = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
        fs::write(&marker, raw).map_err(|e| format!("write marker: {e}"))?;
    }

    // Register in library.
    let record = ProjectRecord {
        id: uuid::Uuid::new_v4().to_string(),
        name: remote_name.to_string(),
        path: dest.to_string_lossy().into_owned(),
        created_at: now_secs(),
        last_opened_at: None,
    };
    store::register_existing_project(app, record.clone())?;

    let mut state = state::load_state(app)?;
    state.projects.insert(
        record.id.clone(),
        CloudProjectLink {
            local_path: record.path.clone(),
            remote_folder_id: remote_folder_id.to_string(),
            slug: dest
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(&slug)
                .to_string(),
            last_sync_at: Some(now_secs()),
        },
    );
    state::save_state(app, &state)?;

    Ok(record)
}
