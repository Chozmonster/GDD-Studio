//! Bring-your-own cloud sync (v1.5 Phase 0–1).
//!
//! Local forever free; cloud is opt-in via the user's Google Drive (OneDrive /
//! Dropbox later behind [`provider::CloudProvider`]). Tokens live in the OS
//! keyring; non-secret link state in `cloud-sync.json`.

mod drive;
mod oauth;
mod provider;
mod state;
mod sync;

pub use drive::credentials_configured;
pub use provider::{RemoteEntry, PROVIDER_GOOGLE_DRIVE};
pub use state::CloudProjectLink;
pub use sync::{SyncResult, ROOT_FOLDER_NAME};

use crate::store::{self, now_secs, ProjectRecord};
use provider::CloudProvider;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

static AUTO_SYNC_CLOSING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    pub linked: bool,
    pub provider_id: Option<String>,
    pub provider_label: Option<String>,
    pub account_label: Option<String>,
    pub root_folder_id: Option<String>,
    pub auto_sync_on_close: bool,
    pub credentials_configured: bool,
    pub linked_project_count: usize,
    pub last_sync_at: Option<u64>,
    pub last_error: Option<String>,
    pub message: String,
}

fn provider_label(id: &str) -> &'static str {
    match id {
        PROVIDER_GOOGLE_DRIVE => "Google Drive",
        provider::PROVIDER_ONEDRIVE => "OneDrive",
        provider::PROVIDER_DROPBOX => "Dropbox",
        _ => "Cloud storage",
    }
}

pub fn status(app: &AppHandle) -> Result<CloudStatus, String> {
    let st = state::load_state(app)?;
    let linked = st.provider_id.is_some() && state::load_refresh_token()?.is_some();
    let creds = credentials_configured();
    let message = if !creds {
        "Google Drive OAuth client id is not configured. Set GDD_STUDIO_GOOGLE_CLIENT_ID before linking.".into()
    } else if linked {
        format!(
            "Linked to {}{}",
            st.provider_id
                .as_deref()
                .map(provider_label)
                .unwrap_or("cloud"),
            st.account_label
                .as_ref()
                .map(|e| format!(" ({e})"))
                .unwrap_or_default()
        )
    } else {
        "Not linked — local projects stay on this device only.".into()
    };
    Ok(CloudStatus {
        linked,
        provider_id: st.provider_id.clone(),
        provider_label: st.provider_id.as_deref().map(provider_label).map(|s| s.to_string()),
        account_label: st.account_label,
        root_folder_id: st.root_folder_id,
        auto_sync_on_close: st.auto_sync_on_close,
        credentials_configured: creds,
        linked_project_count: st.projects.len(),
        last_sync_at: st.last_sync_at,
        last_error: st.last_error,
        message,
    })
}

async fn active_provider(app: &AppHandle) -> Result<Box<dyn CloudProvider>, String> {
    let st = state::load_state(app)?;
    match st.provider_id.as_deref() {
        None | Some(PROVIDER_GOOGLE_DRIVE) => {
            Ok(Box::new(drive::GoogleDriveProvider::try_new()?))
        }
        Some(other) => Err(format!(
            "Provider '{other}' is not available in this build. Unlink and link Google Drive."
        )),
    }
}

async fn access_token(app: &AppHandle, provider: &dyn CloudProvider) -> Result<String, String> {
    let (cached, expires) = state::load_access_token_cache()?;
    let now = now_secs();
    if let Some(token) = cached {
        if expires.map(|e| e > now).unwrap_or(false) {
            return Ok(token);
        }
    }
    let refresh = state::load_refresh_token()?
        .ok_or_else(|| "Cloud storage is not linked (missing refresh token). Link Google Drive in Options.".to_string())?;
    match provider.refresh_access_token(&refresh).await {
        Ok(tokens) => {
            state::store_tokens(
                tokens.refresh_token.as_deref(),
                Some(&tokens.access_token),
                tokens.expires_at,
            )?;
            Ok(tokens.access_token)
        }
        Err(e) => {
            let msg = format!("Session expired — re-link Google Drive in Options. ({e})");
            let _ = state::set_last_error(app, Some(msg.clone()));
            Err(msg)
        }
    }
}

/// Browser OAuth (PKCE + loopback) → ensure `GDD Studio/` root → persist link.
pub async fn link_google_drive(app: &AppHandle) -> Result<CloudStatus, String> {
    if !credentials_configured() {
        return Err(
            "Google Drive OAuth client id is missing. Set the GDD_STUDIO_GOOGLE_CLIENT_ID \
             environment variable (Desktop/public client with PKCE). See the OAuth setup doc."
                .into(),
        );
    }
    let provider = drive::GoogleDriveProvider::try_new()?;
    let pkce = oauth::generate_pkce();
    let oauth_state = oauth::generate_oauth_state();
    let (redirect_uri, listener) = oauth::bind_loopback()?;
    let url = provider.authorize_url(&redirect_uri, &oauth_state, &pkce.challenge);
    oauth::open_authorize_url(&url)?;
    let code = oauth::wait_for_auth_code(listener, &oauth_state)?;
    let tokens = provider
        .exchange_code(&code, &redirect_uri, &pkce.verifier)
        .await?;
    let refresh = tokens.refresh_token.clone().ok_or_else(|| {
        "Google did not return a refresh token. Revoke the app in your Google Account \
         permissions, then Link again (consent prompt required)."
            .to_string()
    })?;
    state::store_tokens(Some(&refresh), Some(&tokens.access_token), tokens.expires_at)?;

    let label = provider
        .fetch_account_label(&tokens.access_token)
        .await
        .unwrap_or(None);
    let root = provider
        .ensure_root(&tokens.access_token, ROOT_FOLDER_NAME)
        .await?;

    // Optional root marker (best-effort).
    let marker = serde_json::json!({
        "format": "gdds-root",
        "version": 1,
        "app": "GDD Studio",
        "appVersion": env!("CARGO_PKG_VERSION"),
        "createdAt": now_secs(),
    });
    let marker_bytes = serde_json::to_vec_pretty(&marker).unwrap_or_default();
    let children = provider
        .list_children(&tokens.access_token, &root.id)
        .await
        .unwrap_or_default();
    let existing_marker = children
        .iter()
        .find(|c| c.name == sync::ROOT_MARKER_FILE)
        .map(|c| c.id.as_str());
    let _ = provider
        .upload_file(
            &tokens.access_token,
            &root.id,
            sync::ROOT_MARKER_FILE,
            &marker_bytes,
            existing_marker,
        )
        .await;

    let prev = state::load_state(app).unwrap_or_default();
    let new_state = state::CloudSyncState {
        provider_id: Some(PROVIDER_GOOGLE_DRIVE.into()),
        account_label: label,
        root_folder_id: Some(root.id),
        linked_at: Some(now_secs()),
        auto_sync_on_close: prev.auto_sync_on_close,
        projects: prev.projects,
        last_error: None,
        last_sync_at: prev.last_sync_at,
    };
    state::save_state(app, &new_state)?;
    status(app)
}

pub fn unlink(app: &AppHandle, _delete_remote: bool) -> Result<CloudStatus, String> {
    // v1.5: leave remote folders intact unless we later wire an explicit delete.
    state::clear_link(app)?;
    status(app)
}

pub fn set_auto_sync_on_close(app: &AppHandle, enabled: bool) -> Result<CloudStatus, String> {
    let mut st = state::load_state(app)?;
    st.auto_sync_on_close = enabled;
    state::save_state(app, &st)?;
    status(app)
}

pub async fn sync_project(
    app: &AppHandle,
    project_id: String,
    apply_local_deletes: bool,
    resolutions: HashMap<String, String>,
) -> Result<SyncResult, String> {
    if !state::is_linked(app) {
        return Err("Link Google Drive in Options before syncing.".into());
    }
    let provider = active_provider(app).await?;
    let token = match access_token(app, provider.as_ref()).await {
        Ok(t) => t,
        Err(e) => {
            return Ok(SyncResult {
                uploaded: 0,
                downloaded: 0,
                deleted_local: 0,
                deleted_remote: 0,
                skipped: 0,
                conflicts: vec![],
                pending_local_deletes: vec![],
                log: vec![e.clone()],
                offline: e.to_lowercase().contains("offline")
                    || e.to_lowercase().contains("dns")
                    || e.to_lowercase().contains("network"),
                message: e,
            });
        }
    };
    let project = store::load_projects(app)?
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Unknown project id: {project_id}"))?;

    match sync::sync_project(
        app,
        provider.as_ref(),
        &token,
        &project,
        apply_local_deletes,
        &resolutions,
    )
    .await
    {
        Ok(result) => Ok(result),
        Err(e) => {
            let offline = is_offline_error(&e);
            let _ = state::set_last_error(app, Some(e.clone()));
            Ok(SyncResult {
                uploaded: 0,
                downloaded: 0,
                deleted_local: 0,
                deleted_remote: 0,
                skipped: 0,
                conflicts: vec![],
                pending_local_deletes: vec![],
                log: vec![e.clone()],
                offline,
                message: if offline {
                    format!("Offline / network error — retry when connected. ({e})")
                } else {
                    e
                },
            })
        }
    }
}

fn is_offline_error(e: &str) -> bool {
    let lower = e.to_lowercase();
    lower.contains("offline")
        || lower.contains("dns")
        || lower.contains("network")
        || lower.contains("connection")
        || lower.contains("timed out")
        || lower.contains("unreachable")
}

pub async fn list_remote_projects(app: &AppHandle) -> Result<Vec<RemoteEntry>, String> {
    if !state::is_linked(app) {
        return Err("Link Google Drive in Options first.".into());
    }
    let st = state::load_state(app)?;
    let root = st
        .root_folder_id
        .ok_or_else(|| "Missing cloud root folder — re-link Google Drive.".to_string())?;
    let provider = active_provider(app).await?;
    let token = access_token(app, provider.as_ref()).await?;
    sync::list_remote_projects(provider.as_ref(), &token, &root).await
}

pub async fn open_from_cloud(
    app: &AppHandle,
    remote_folder_id: String,
    remote_name: String,
    parent_dir: String,
) -> Result<ProjectRecord, String> {
    if !state::is_linked(app) {
        return Err("Link Google Drive in Options first.".into());
    }
    store::validate_entity_id(&remote_folder_id, "remote folder")?;
    let provider = active_provider(app).await?;
    let token = access_token(app, provider.as_ref()).await?;
    sync::download_remote_project(
        app,
        provider.as_ref(),
        &token,
        &remote_folder_id,
        &remote_name,
        &parent_dir,
    )
    .await
}

pub fn project_link(app: &AppHandle, project_id: &str) -> Result<Option<CloudProjectLink>, String> {
    let st = state::load_state(app)?;
    Ok(st.projects.get(project_id).cloned())
}

pub fn should_auto_sync_on_close(app: &AppHandle) -> bool {
    state::load_state(app)
        .map(|s| s.auto_sync_on_close && s.provider_id.is_some())
        .unwrap_or(false)
        && state::load_refresh_token().ok().flatten().is_some()
}

/// Best-effort sync of all linked projects (used on close).
pub async fn sync_all_linked(app: &AppHandle) -> Result<(), String> {
    let st = state::load_state(app)?;
    let ids: Vec<String> = st.projects.keys().cloned().collect();
    for id in ids {
        let _ = sync_project(app, id, false, HashMap::new()).await;
    }
    Ok(())
}

/// Hook from the main window close path.
pub fn handle_close_requested(app: &AppHandle, label: &str, api: &tauri::CloseRequestApi) {
    if label != "main" {
        return;
    }
    if AUTO_SYNC_CLOSING.load(Ordering::SeqCst) {
        return;
    }
    if !should_auto_sync_on_close(app) {
        return;
    }
    api.prevent_close();
    AUTO_SYNC_CLOSING.store(true, Ordering::SeqCst);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = sync_all_linked(&app).await;
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.destroy();
        }
        AUTO_SYNC_CLOSING.store(false, Ordering::SeqCst);
    });
}
