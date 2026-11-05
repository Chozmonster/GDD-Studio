//! Local persistence for the project library, settings, and on-disk project
//! payloads (docs, flowcharts, RGD sheets, mood board, assets, templates).
//!
//! Security invariants:
//! - Entity ids are filename-safe (`validate_entity_id`) — no path traversal.
//! - Asset / export paths must stay under the project root (`ensure_path_within`).
//! - SVG/SVGZ media is rejected at ingest (`is_disallowed_svg`).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const LIBRARY_FILE: &str = "project-library.json";
const SETTINGS_FILE: &str = "settings.json";
const WINDOW_GEOMETRY_FILE: &str = "window-geometry.json";
const PROJECT_MARKER: &str = "gdd-studio.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometryFile {
    pub launcher: Option<WindowGeometry>,
    pub editor: Option<WindowGeometry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,
    pub last_opened_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProjectLibrary {
    projects: Vec<ProjectRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// When true, check ~daily and auto download/install if an update exists.
    pub automatic_updates: bool,
    /// Unix seconds of the last update check (manual or automatic).
    pub last_update_check_at: Option<u64>,
    /// When true, document variable chips show the name with the value.
    #[serde(default)]
    pub display_variable_names: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            automatic_updates: true,
            last_update_check_at: None,
            display_variable_names: false,
        }
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
    Ok(dir)
}

/// Entity ids used as filenames: alphanumeric, dash, underscore, dot — no traversal.
fn validate_entity_id(id: &str, kind: &str) -> Result<(), String> {
    let id = id.trim();
    if id.is_empty() || id.len() > 128 {
        return Err(format!("Invalid {kind} id"));
    }
    if id == "." || id == ".." || id.contains("..") {
        return Err(format!("Invalid {kind} id"));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(format!("Invalid {kind} id"));
    }
    Ok(())
}

/// Ensure `candidate` resolves inside `root` (after canonicalize when possible).
fn ensure_path_within(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let candidate_canon = if candidate.exists() {
        fs::canonicalize(candidate).map_err(|e| format!("resolve path: {e}"))?
    } else {
        // For not-yet-written paths, canonicalize the parent and append the name.
        let parent = candidate
            .parent()
            .ok_or_else(|| "Invalid path".to_string())?;
        let name = candidate
            .file_name()
            .ok_or_else(|| "Invalid path".to_string())?;
        let parent_canon = if parent.exists() {
            fs::canonicalize(parent).map_err(|e| format!("resolve parent: {e}"))?
        } else {
            parent.to_path_buf()
        };
        parent_canon.join(name)
    };
    if !candidate_canon.starts_with(&root_canon) {
        return Err("Path escapes allowed directory".into());
    }
    Ok(candidate_canon)
}

fn sanitize_filename(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("asset.bin");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let cleaned = cleaned.trim_matches('.').to_string();
    if cleaned.is_empty() {
        "asset.bin".into()
    } else {
        cleaned.chars().take(180).collect()
    }
}

fn sanitize_mime(mime: &str) -> String {
    let cleaned: String = mime
        .chars()
        .take(120)
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '+' | '.'))
        .collect();
    if cleaned.is_empty() || !cleaned.contains('/') {
        "application/octet-stream".into()
    } else {
        cleaned
    }
}

/// SVG / SVGZ are scriptable XML — block at ingest for Mood Board + doc media.
fn is_disallowed_svg(filename: &str, mime: &str) -> bool {
    let m = mime.to_ascii_lowercase();
    let f = filename.to_ascii_lowercase();
    m.contains("svg") || f.ends_with(".svg") || f.ends_with(".svgz")
}

const MAX_ASSET_BYTES: usize = 200 * 1024 * 1024;
const MAX_EXPORT_HTML_BYTES: usize = 32 * 1024 * 1024;
const MAX_MOOD_BOARD_ITEMS: usize = 500;
const MAX_MOOD_COMMENT_CHARS: usize = 2_000;

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> Result<T, String> {
    if !path.exists() {
        return Ok(T::default());
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(T::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("parse {}: {e}", path.display()))
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create parent: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(value).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, raw).map_err(|e| format!("write {}: {e}", path.display()))
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(LIBRARY_FILE))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(SETTINGS_FILE))
}

pub fn load_projects(app: &AppHandle) -> Result<Vec<ProjectRecord>, String> {
    let lib: ProjectLibrary = read_json(&library_path(app)?)?;
    let mut projects = lib.projects;
    projects.sort_by(|a, b| {
        b.last_opened_at
            .unwrap_or(0)
            .cmp(&a.last_opened_at.unwrap_or(0))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(projects)
}

fn save_projects(app: &AppHandle, projects: Vec<ProjectRecord>) -> Result<(), String> {
    write_json(&library_path(app)?, &ProjectLibrary { projects })
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    read_json(&settings_path(app)?)
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    write_json(&settings_path(app)?, settings)
}

fn window_geometry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(WINDOW_GEOMETRY_FILE))
}

pub fn load_window_geometry(app: &AppHandle) -> Result<WindowGeometryFile, String> {
    read_json(&window_geometry_path(app)?)
}

pub fn save_window_geometry(app: &AppHandle, file: &WindowGeometryFile) -> Result<(), String> {
    write_json(&window_geometry_path(app)?, file)
}

pub fn create_project(
    app: &AppHandle,
    name: String,
    parent_dir: String,
) -> Result<ProjectRecord, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Project name is required".into());
    }
    let parent = PathBuf::from(&parent_dir);
    if !parent.is_absolute() {
        return Err("Parent directory must be an absolute path".into());
    }
    if !parent.is_dir() {
        return Err(format!("Parent directory does not exist: {parent_dir}"));
    }

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
    let folder_name = if slug.is_empty() { "gdd-project" } else { slug };
    let mut path = parent.join(folder_name);
    let mut n = 2u32;
    while path.exists() {
        path = parent.join(format!("{folder_name}-{n}"));
        n += 1;
    }

    fs::create_dir_all(&path).map_err(|e| format!("create project folder: {e}"))?;
    let marker = serde_json::json!({
        "format": "gdd-studio-project",
        "version": 1,
        "name": name,
    });
    write_json(&path.join(PROJECT_MARKER), &marker)?;

    let record = ProjectRecord {
        id: Uuid::new_v4().to_string(),
        name,
        path: path.to_string_lossy().into_owned(),
        created_at: now_secs(),
        last_opened_at: None,
    };

    let mut projects = load_projects(app)?;
    projects.push(record.clone());
    save_projects(app, projects)?;
    Ok(record)
}

pub fn delete_project(app: &AppHandle, project_id: String) -> Result<(), String> {
    let mut projects = load_projects(app)?;
    let before = projects.len();
    projects.retain(|p| p.id != project_id);
    if projects.len() == before {
        return Err(format!("Unknown project id: {project_id}"));
    }
    save_projects(app, projects)
}

pub fn open_project_record(app: &AppHandle, project_id: String) -> Result<ProjectRecord, String> {
    let mut projects = load_projects(app)?;
    let idx = projects
        .iter()
        .position(|p| p.id == project_id)
        .ok_or_else(|| format!("Unknown project id: {project_id}"))?;
    projects[idx].last_opened_at = Some(now_secs());
    let record = projects[idx].clone();
    save_projects(app, projects)?;
    Ok(record)
}

const FLOWCHARTS_DIR: &str = "flowcharts";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowchartSummary {
    pub id: String,
    pub name: String,
}

fn project_by_id(app: &AppHandle, project_id: &str) -> Result<ProjectRecord, String> {
    load_projects(app)?
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Unknown project id: {project_id}"))
}

fn flowchart_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(FLOWCHARTS_DIR)
}

fn flowchart_path(project: &ProjectRecord, flowchart_id: &str) -> Result<PathBuf, String> {
    validate_entity_id(flowchart_id, "flowchart")?;
    let id = flowchart_id.trim();
    let dir = flowchart_dir(project);
    let path = dir.join(format!("{id}.json"));
    ensure_path_within(&dir, &path)?;
    Ok(path)
}

pub fn list_flowcharts(app: &AppHandle, project_id: String) -> Result<Vec<FlowchartSummary>, String> {
    let project = project_by_id(app, &project_id)?;
    let dir = flowchart_dir(&project);
    let mut items = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("read flowcharts: {e}"))? {
            let entry = entry.map_err(|e| format!("read flowcharts entry: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("untitled")
                .to_string();
            let name = fs::read_to_string(&path)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|v| {
                    v.get("name")
                        .and_then(|n| n.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| id.clone());
            items.push(FlowchartSummary { id, name });
        }
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    if items.is_empty() {
        items.push(FlowchartSummary {
            id: "main".into(),
            name: "Main".into(),
        });
    }
    Ok(items)
}

pub fn load_flowchart(
    app: &AppHandle,
    project_id: String,
    flowchart_id: String,
) -> Result<serde_json::Value, String> {
    let project = project_by_id(app, &project_id)?;
    let path = flowchart_path(&project, &flowchart_id)?;
    if !path.exists() {
        return Ok(empty_flowchart_doc(&flowchart_id));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read flowchart: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse flowchart: {e}"))
}

pub fn save_flowchart(
    app: &AppHandle,
    project_id: String,
    flowchart_id: String,
    document: serde_json::Value,
) -> Result<(), String> {
    let project = project_by_id(app, &project_id)?;
    let path = flowchart_path(&project, &flowchart_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create flowcharts dir: {e}"))?;
    }
    write_json(&path, &document)
}

fn empty_flowchart_doc(id: &str) -> serde_json::Value {
    serde_json::json!({
        "format": "gdd-studio-flowchart",
        "version": 2,
        "id": id,
        "name": if id == "main" { "Main" } else { id },
        "nodes": [],
        "edges": [],
        "viewport": { "x": 0, "y": 0, "zoom": 1 }
    })
}

pub fn flowchart_exists(app: &AppHandle, project_id: String, flowchart_id: String) -> Result<bool, String> {
    let project = project_by_id(app, &project_id)?;
    let path = flowchart_path(&project, &flowchart_id)?;
    Ok(path.is_file())
}

pub fn delete_flowchart(
    app: &AppHandle,
    project_id: String,
    flowchart_id: String,
) -> Result<(), String> {
    let project = project_by_id(app, &project_id)?;
    let path = flowchart_path(&project, &flowchart_id)?;
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("delete flowchart: {e}"))?;
    }
    Ok(())
}

const VARIABLES_FILE: &str = "variables.json";

/// Project-wide plain-text variable. Legacy `kind` / `value_type` fields and
/// numeric `value`s are accepted on load and dropped on save.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocVariable {
    pub id: String,
    pub name: String,
    #[serde(deserialize_with = "deserialize_stringish_value")]
    pub value: String,
}

fn deserialize_stringish_value<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v = serde_json::Value::deserialize(deserializer).map_err(serde::de::Error::custom)?;
    Ok(match v {
        serde_json::Value::String(s) => s,
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    })
}

fn variables_path(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(VARIABLES_FILE)
}

pub fn load_variables(app: &AppHandle, project_id: String) -> Result<Vec<DocVariable>, String> {
    let project = project_by_id(app, &project_id)?;
    let path = variables_path(&project);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read variables: {e}"))?;
    // Unknown legacy fields (kind, value_type) are ignored by serde defaults.
    serde_json::from_str(&raw).map_err(|e| format!("parse variables: {e}"))
}

pub fn save_variables(
    app: &AppHandle,
    project_id: String,
    variables: Vec<DocVariable>,
) -> Result<(), String> {
    let project = project_by_id(app, &project_id)?;
    // Writes id/name/value only — no type field.
    write_json(&variables_path(&project), &variables)
}

const RGD_DIR: &str = "rgd";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RgdSheetSummary {
    pub id: String,
    pub name: String,
}

fn rgd_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(RGD_DIR)
}

fn rgd_sheet_path(project: &ProjectRecord, sheet_id: &str) -> Result<PathBuf, String> {
    validate_entity_id(sheet_id, "RGD sheet")?;
    let id = sheet_id.trim();
    let dir = rgd_dir(project);
    let path = dir.join(format!("{id}.json"));
    ensure_path_within(&dir, &path)?;
    Ok(path)
}

pub fn list_rgd_sheets(app: &AppHandle, project_id: String) -> Result<Vec<RgdSheetSummary>, String> {
    let project = project_by_id(app, &project_id)?;
    let dir = rgd_dir(&project);
    let mut items = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("read rgd sheets: {e}"))? {
            let entry = entry.map_err(|e| format!("read rgd sheets entry: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("untitled")
                .to_string();
            let name = fs::read_to_string(&path)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|v| {
                    v.get("name")
                        .and_then(|n| n.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| id.clone());
            items.push(RgdSheetSummary { id, name });
        }
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

pub fn load_rgd_sheet(
    app: &AppHandle,
    project_id: String,
    sheet_id: String,
) -> Result<serde_json::Value, String> {
    let project = project_by_id(app, &project_id)?;
    let path = rgd_sheet_path(&project, &sheet_id)?;
    if !path.exists() {
        return Ok(empty_rgd_sheet_doc(&sheet_id));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read rgd sheet: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse rgd sheet: {e}"))
}

pub fn save_rgd_sheet(
    app: &AppHandle,
    project_id: String,
    sheet_id: String,
    document: serde_json::Value,
) -> Result<(), String> {
    let project = project_by_id(app, &project_id)?;
    let path = rgd_sheet_path(&project, &sheet_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create rgd dir: {e}"))?;
    }
    write_json(&path, &document)
}

fn empty_rgd_sheet_doc(id: &str) -> serde_json::Value {
    serde_json::json!({
        "format": "gdd-studio-rgd-sheet",
        "version": 2,
        "id": id,
        "name": if id == "main" { "Main gameplay" } else { id },
        "primaryFlowchartId": "",
        "mechanics": [],
        "meta": {}
    })
}

pub fn rgd_sheet_exists(
    app: &AppHandle,
    project_id: String,
    sheet_id: String,
) -> Result<bool, String> {
    let project = project_by_id(app, &project_id)?;
    let path = rgd_sheet_path(&project, &sheet_id)?;
    Ok(path.is_file())
}

pub fn delete_rgd_sheet(
    app: &AppHandle,
    project_id: String,
    sheet_id: String,
) -> Result<(), String> {
    let project = project_by_id(app, &project_id)?;
    let path = rgd_sheet_path(&project, &sheet_id)?;
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("delete rgd sheet: {e}"))?;
    }
    Ok(())
}

// ── Project documents (one primary `main` doc; extras kept for migration) ──

const DOCS_DIR: &str = "docs";
const LEGACY_DOCUMENT_FILE: &str = "document.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocSummary {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub body: serde_json::Value,
    pub updated_at: u64,
    #[serde(default)]
    pub template_id: Option<String>,
}

fn docs_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(DOCS_DIR)
}

fn doc_file_path(project: &ProjectRecord, doc_id: &str) -> Result<PathBuf, String> {
    validate_entity_id(doc_id, "document")?;
    let id = doc_id.trim();
    let dir = docs_dir(project);
    let path = dir.join(format!("{id}.json"));
    ensure_path_within(&dir, &path)?;
    Ok(path)
}

fn slugify(input: &str) -> String {
    let slug: String = input
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "untitled".into()
    } else {
        slug
    }
}

fn default_doc_body(title: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": { "level": 1 },
                "content": [{ "type": "text", "text": title }]
            },
            {
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "Start writing. Link to another document with [[Doc Title]]."
                }]
            }
        ]
    })
}

/// Migrate legacy single `document.json` into `docs/main.json` when needed.
fn ensure_docs_migrated(project: &ProjectRecord) -> Result<(), String> {
    let dir = docs_dir(project);
    let main_path = dir.join("main.json");
    if main_path.is_file() {
        return Ok(());
    }
    let legacy = PathBuf::from(&project.path).join(LEGACY_DOCUMENT_FILE);
    fs::create_dir_all(&dir).map_err(|e| format!("create docs dir: {e}"))?;
    if legacy.is_file() {
        let raw = fs::read_to_string(&legacy).map_err(|e| format!("read legacy document: {e}"))?;
        let body: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("parse legacy document: {e}"))?;
        let doc = ProjectDocument {
            id: "main".into(),
            title: project.name.clone(),
            slug: "main".into(),
            body,
            updated_at: now_secs(),
            template_id: None,
        };
        write_json(&main_path, &doc)?;
    } else {
        let doc = ProjectDocument {
            id: "main".into(),
            title: project.name.clone(),
            slug: "main".into(),
            body: default_doc_body(&project.name),
            updated_at: now_secs(),
            template_id: None,
        };
        write_json(&main_path, &doc)?;
    }
    Ok(())
}

pub fn list_documents(app: &AppHandle, project_id: String) -> Result<Vec<DocSummary>, String> {
    let project = project_by_id(app, &project_id)?;
    ensure_docs_migrated(&project)?;
    let dir = docs_dir(&project);
    let mut items = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("read docs: {e}"))? {
            let entry = entry.map_err(|e| format!("read docs entry: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let raw = match fs::read_to_string(&path) {
                Ok(r) => r,
                Err(_) => continue,
            };
            if let Ok(doc) = serde_json::from_str::<ProjectDocument>(&raw) {
                items.push(DocSummary {
                    id: doc.id,
                    title: doc.title,
                    slug: doc.slug,
                    updated_at: doc.updated_at,
                });
            }
        }
    }
    items.sort_by(|a, b| {
        if a.id == "main" {
            return std::cmp::Ordering::Less;
        }
        if b.id == "main" {
            return std::cmp::Ordering::Greater;
        }
        a.title.to_lowercase().cmp(&b.title.to_lowercase())
    });
    Ok(items)
}

pub fn load_project_document(
    app: &AppHandle,
    project_id: String,
    doc_id: String,
) -> Result<ProjectDocument, String> {
    let project = project_by_id(app, &project_id)?;
    ensure_docs_migrated(&project)?;
    let path = doc_file_path(&project, &doc_id)?;
    if !path.exists() {
        return Err(format!("Unknown document id: {doc_id}"));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read document: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse document: {e}"))
}

pub fn save_project_document(
    app: &AppHandle,
    project_id: String,
    document: ProjectDocument,
) -> Result<ProjectDocument, String> {
    let project = project_by_id(app, &project_id)?;
    ensure_docs_migrated(&project)?;
    let mut document = document;
    if document.id.trim().is_empty() {
        return Err("Document id is required".into());
    }
    if document.slug.trim().is_empty() {
        document.slug = slugify(&document.title);
    }
    document.updated_at = now_secs();
    let path = doc_file_path(&project, &document.id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create docs dir: {e}"))?;
    }
    write_json(&path, &document)?;

    // Keep legacy document.json in sync for the main doc (older tooling / backups).
    if document.id == "main" {
        write_json(
            &PathBuf::from(&project.path).join(LEGACY_DOCUMENT_FILE),
            &document.body,
        )?;
    }
    Ok(document)
}

pub fn create_project_document(
    app: &AppHandle,
    project_id: String,
    title: String,
) -> Result<ProjectDocument, String> {
    let project = project_by_id(app, &project_id)?;
    ensure_docs_migrated(&project)?;
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Document title is required".into());
    }
    let base = slugify(&title);
    let mut id = base.clone();
    let mut n = 2u32;
    while doc_file_path(&project, &id)?.exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    let doc = ProjectDocument {
        id: id.clone(),
        title: title.clone(),
        slug: id,
        body: default_doc_body(&title),
        updated_at: now_secs(),
        template_id: None,
    };
    save_project_document(app, project_id, doc)
}

pub fn delete_project_document(
    app: &AppHandle,
    project_id: String,
    doc_id: String,
) -> Result<(), String> {
    if doc_id == "main" {
        return Err("Cannot delete the main document".into());
    }
    let project = project_by_id(app, &project_id)?;
    let path = doc_file_path(&project, &doc_id)?;
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("delete document: {e}"))?;
    }
    Ok(())
}

pub fn resolve_wiki_slug(
    app: &AppHandle,
    project_id: String,
    slug_or_title: String,
) -> Result<Option<DocSummary>, String> {
    let needle = slug_or_title.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(None);
    }
    let docs = list_documents(app, project_id)?;
    let found = docs.into_iter().find(|d| {
        d.slug.to_lowercase() == needle
            || d.id.to_lowercase() == needle
            || d.title.to_lowercase() == needle
            || slugify(&d.title) == slugify(&needle)
    });
    Ok(found)
}

/// Scan all document bodies for wikiLink nodes targeting `target_doc_id` / slug / title.
pub fn list_backlinks(
    app: &AppHandle,
    project_id: String,
    target_doc_id: String,
) -> Result<Vec<DocSummary>, String> {
    let docs = list_documents(app, project_id.clone())?;
    let target = docs
        .iter()
        .find(|d| d.id == target_doc_id)
        .cloned()
        .ok_or_else(|| format!("Unknown document id: {target_doc_id}"))?;
    let mut backlinks = Vec::new();
    for summary in &docs {
        if summary.id == target.id {
            continue;
        }
        let full = load_project_document(app, project_id.clone(), summary.id.clone())?;
        if body_links_to(&full.body, &target) {
            backlinks.push(summary.clone());
        }
    }
    Ok(backlinks)
}

fn body_links_to(value: &serde_json::Value, target: &DocSummary) -> bool {
    match value {
        serde_json::Value::Object(map) => {
            let is_wiki = map.get("type").and_then(|t| t.as_str()) == Some("wikiLink");
            if is_wiki {
                if let Some(attrs) = map.get("attrs") {
                    let doc_id = attrs.get("docId").and_then(|v| v.as_str()).unwrap_or("");
                    let slug = attrs.get("slug").and_then(|v| v.as_str()).unwrap_or("");
                    let title = attrs.get("title").and_then(|v| v.as_str()).unwrap_or("");
                    if (!doc_id.is_empty() && doc_id == target.id)
                        || (!slug.is_empty()
                            && (slug.eq_ignore_ascii_case(&target.slug)
                                || slug.eq_ignore_ascii_case(&target.id)))
                        || (!title.is_empty() && title.eq_ignore_ascii_case(&target.title))
                    {
                        return true;
                    }
                }
            }
            map.values().any(|v| body_links_to(v, target))
        }
        serde_json::Value::Array(arr) => arr.iter().any(|v| body_links_to(v, target)),
        _ => false,
    }
}

// Keep legacy load/save_document working by bridging to main project document.
pub fn load_document(app: &AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    let doc = load_project_document(app, project_id, "main".into())?;
    Ok(doc.body)
}

pub fn save_document(
    app: &AppHandle,
    project_id: String,
    document: serde_json::Value,
) -> Result<(), String> {
    let mut doc = match load_project_document(app, project_id.clone(), "main".into()) {
        Ok(d) => d,
        Err(_) => {
            let project = project_by_id(app, &project_id)?;
            ProjectDocument {
                id: "main".into(),
                title: project.name.clone(),
                slug: "main".into(),
                body: document.clone(),
                updated_at: now_secs(),
                template_id: None,
            }
        }
    };
    doc.body = document;
    save_project_document(app, project_id, doc)?;
    Ok(())
}

// ── Media assets ───────────────────────────────────────────────────────────

const ASSETS_DIR: &str = "assets";
const ASSETS_INDEX: &str = "assets.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub kind: String,
    pub filename: String,
    pub mime: String,
    pub byte_size: u64,
    pub storage_ref: String,
    pub created_at: u64,
}

fn assets_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(ASSETS_DIR)
}

fn assets_index_path(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(ASSETS_INDEX)
}

fn load_asset_index(project: &ProjectRecord) -> Result<Vec<AssetRecord>, String> {
    let path = assets_index_path(project);
    if !path.exists() {
        return Ok(Vec::new());
    }
    read_json(&path)
}

fn save_asset_index(project: &ProjectRecord, assets: &[AssetRecord]) -> Result<(), String> {
    write_json(&assets_index_path(project), &assets)
}

fn kind_from_mime(mime: &str, filename: &str) -> String {
    let m = mime.to_lowercase();
    let lower = filename.to_lowercase();
    if m.starts_with("image/") || lower.ends_with(".gif") {
        if m.contains("gif") || lower.ends_with(".gif") {
            "gif".into()
        } else {
            "image".into()
        }
    } else if m.starts_with("video/") {
        "video".into()
    } else if m.starts_with("audio/") {
        "audio".into()
    } else if lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".mov")
        || lower.ends_with(".mkv")
    {
        "video".into()
    } else if lower.ends_with(".mp3")
        || lower.ends_with(".wav")
        || lower.ends_with(".ogg")
        || lower.ends_with(".m4a")
        || lower.ends_with(".flac")
    {
        "audio".into()
    } else {
        "image".into()
    }
}

fn extension_for(filename: &str, mime: &str, kind: &str) -> String {
    if let Some(ext) = Path::new(filename).extension().and_then(|e| e.to_str()) {
        if !ext.is_empty() {
            return ext.to_ascii_lowercase();
        }
    }
    if let Some(subtype) = mime.split('/').nth(1) {
        let clean = subtype.split(';').next().unwrap_or(subtype);
        if !clean.is_empty() && clean.len() <= 8 {
            return clean.replace("jpeg", "jpg");
        }
    }
    match kind {
        "gif" => "gif".into(),
        "video" => "mp4".into(),
        "audio" => "mp3".into(),
        _ => "bin".into(),
    }
}

pub fn list_assets(app: &AppHandle, project_id: String) -> Result<Vec<AssetRecord>, String> {
    let project = project_by_id(app, &project_id)?;
    Ok(load_asset_index(&project)?)
}

pub fn save_asset(
    app: &AppHandle,
    project_id: String,
    filename: String,
    mime: String,
    data_base64: String,
) -> Result<AssetRecord, String> {
    let project = project_by_id(app, &project_id)?;
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        data_base64.trim(),
    )
    .map_err(|e| format!("decode asset: {e}"))?;
    if bytes.is_empty() {
        return Err("Asset data is empty".into());
    }
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(format!(
            "Asset exceeds {} MB limit",
            MAX_ASSET_BYTES / (1024 * 1024)
        ));
    }
    let filename = sanitize_filename(&filename);
    let mime = sanitize_mime(&mime);
    if is_disallowed_svg(&filename, &mime) {
        return Err(
            "SVG media is not allowed (scriptable XML). Use PNG, JPEG, GIF, WebP, video, or audio."
                .into(),
        );
    }
    let kind = kind_from_mime(&mime, &filename);
    let ext = extension_for(&filename, &mime, &kind);
    // Extension must stay a simple suffix — never path segments.
    let ext = {
        let e = ext.replace(['/', '\\', '.'], "");
        if e.is_empty()
            || !e
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            || e.len() > 12
        {
            match kind.as_str() {
                "gif" => "gif".into(),
                "video" => "mp4".into(),
                "audio" => "mp3".into(),
                _ => "bin".into(),
            }
        } else {
            e
        }
    };
    let id = Uuid::new_v4().to_string();
    let storage_ref = format!("{id}.{ext}");
    validate_entity_id(&storage_ref, "asset storage")?;
    let dir = assets_dir(&project);
    fs::create_dir_all(&dir).map_err(|e| format!("create assets dir: {e}"))?;
    let path = dir.join(&storage_ref);
    let path = ensure_path_within(&dir, &path)?;
    fs::write(&path, &bytes).map_err(|e| format!("write asset: {e}"))?;

    let record = AssetRecord {
        id,
        kind,
        filename,
        mime,
        byte_size: bytes.len() as u64,
        storage_ref,
        created_at: now_secs(),
    };
    let mut index = load_asset_index(&project)?;
    index.push(record.clone());
    save_asset_index(&project, &index)?;
    Ok(record)
}

fn resolve_asset_file(project: &ProjectRecord, record: &AssetRecord) -> Result<PathBuf, String> {
    validate_entity_id(&record.storage_ref, "asset storage")?;
    let dir = assets_dir(project);
    let path = dir.join(&record.storage_ref);
    ensure_path_within(&dir, &path)
}

pub fn get_asset_path(
    app: &AppHandle,
    project_id: String,
    asset_id: String,
) -> Result<String, String> {
    validate_entity_id(&asset_id, "asset")?;
    let project = project_by_id(app, &project_id)?;
    let index = load_asset_index(&project)?;
    let record = index
        .iter()
        .find(|a| a.id == asset_id)
        .ok_or_else(|| format!("Unknown asset id: {asset_id}"))?;
    let path = resolve_asset_file(&project, record)?;
    if !path.is_file() {
        return Err(format!("Asset file missing: {}", path.display()));
    }
    Ok(path.to_string_lossy().into_owned())
}

pub fn get_asset_data_url(
    app: &AppHandle,
    project_id: String,
    asset_id: String,
) -> Result<String, String> {
    validate_entity_id(&asset_id, "asset")?;
    let project = project_by_id(app, &project_id)?;
    let index = load_asset_index(&project)?;
    let record = index
        .iter()
        .find(|a| a.id == asset_id)
        .ok_or_else(|| format!("Unknown asset id: {asset_id}"))?;
    let path = resolve_asset_file(&project, record)?;
    let bytes = fs::read(&path).map_err(|e| format!("read asset: {e}"))?;
    // Cap data-URL export to ~25MB to avoid IPC blowups.
    if bytes.len() > 25 * 1024 * 1024 {
        return Err("Asset too large for data URL; use file path instead".into());
    }
    let mime = sanitize_mime(&record.mime);
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

pub fn delete_asset(app: &AppHandle, project_id: String, asset_id: String) -> Result<(), String> {
    validate_entity_id(&asset_id, "asset")?;
    let project = project_by_id(app, &project_id)?;
    let mut index = load_asset_index(&project)?;
    let Some(pos) = index.iter().position(|a| a.id == asset_id) else {
        return Err(format!("Unknown asset id: {asset_id}"));
    };
    let record = index.remove(pos);
    if let Ok(path) = resolve_asset_file(&project, &record) {
        if path.is_file() {
            let _ = fs::remove_file(&path);
        }
    }
    save_asset_index(&project, &index)?;
    Ok(())
}

// ── Mood Board ─────────────────────────────────────────────────────────────

const MOOD_BOARD_FILE: &str = "mood-board.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodBoardCrop {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodBoardBorder {
    pub width: f64,
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodBoardItem {
    pub id: String,
    pub asset_id: String,
    #[serde(default)]
    pub comment: String,
    pub created_at: u64,
    /// Normalized image crop; omitted when full-frame.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop: Option<MoodBoardCrop>,
    /// Decorative border; omitted when unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border: Option<MoodBoardBorder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodBoardDocument {
    pub format: String,
    pub version: u32,
    pub items: Vec<MoodBoardItem>,
}

fn mood_board_path(project: &ProjectRecord) -> Result<PathBuf, String> {
    let root = PathBuf::from(&project.path);
    let path = root.join(MOOD_BOARD_FILE);
    ensure_path_within(&root, &path)
}

fn empty_mood_board() -> MoodBoardDocument {
    MoodBoardDocument {
        format: "gdd-studio-mood-board".into(),
        version: 1,
        items: Vec::new(),
    }
}

fn sanitize_mood_comment(comment: &str) -> String {
    comment
        .trim()
        .chars()
        .take(MAX_MOOD_COMMENT_CHARS)
        .collect()
}

fn clamp01(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    v.clamp(0.0, 1.0)
}

fn sanitize_mood_crop(crop: MoodBoardCrop) -> Option<MoodBoardCrop> {
    let width = crop.width.clamp(0.05, 1.0);
    let height = crop.height.clamp(0.05, 1.0);
    let x = clamp01(crop.x).min(1.0 - width);
    let y = clamp01(crop.y).min(1.0 - height);
    if x <= 0.0001 && y <= 0.0001 && width >= 0.9999 && height >= 0.9999 {
        return None;
    }
    Some(MoodBoardCrop {
        x,
        y,
        width,
        height,
    })
}

fn sanitize_mood_border_color(color: &str) -> String {
    let t = color.trim();
    let ok = t.starts_with('#')
        && (t.len() == 4 || t.len() == 7 || t.len() == 9)
        && t[1..].chars().all(|c| c.is_ascii_hexdigit());
    if ok {
        t.to_ascii_lowercase()
    } else {
        "#e8e8e8".into()
    }
}

fn sanitize_mood_border(border: MoodBoardBorder) -> Option<MoodBoardBorder> {
    let width = if border.width.is_finite() {
        border.width.clamp(0.0, 64.0).round()
    } else {
        0.0
    };
    let radius = border.radius.and_then(|r| {
        if !r.is_finite() {
            return None;
        }
        let n = r.clamp(0.0, 64.0).round();
        if n > 0.0 {
            Some(n)
        } else {
            None
        }
    });
    if width <= 0.0 && radius.is_none() {
        return None;
    }
    Some(MoodBoardBorder {
        width,
        color: sanitize_mood_border_color(&border.color),
        radius,
    })
}

fn normalize_mood_board_items(items: &mut Vec<MoodBoardItem>) -> Result<(), String> {
    if items.len() > MAX_MOOD_BOARD_ITEMS {
        return Err(format!(
            "Mood board exceeds {MAX_MOOD_BOARD_ITEMS} item limit"
        ));
    }
    for item in items.iter_mut() {
        item.comment = sanitize_mood_comment(&item.comment);
        if item.id.trim().is_empty() {
            item.id = Uuid::new_v4().to_string();
        }
        validate_entity_id(&item.id, "mood board item")?;
        if item.asset_id.trim().is_empty() {
            return Err("Mood board item missing assetId".into());
        }
        validate_entity_id(&item.asset_id, "asset")?;
        item.crop = item.crop.take().and_then(sanitize_mood_crop);
        item.border = item.border.take().and_then(sanitize_mood_border);
    }
    Ok(())
}

pub fn load_mood_board(
    app: &AppHandle,
    project_id: String,
) -> Result<MoodBoardDocument, String> {
    let project = project_by_id(app, &project_id)?;
    let path = mood_board_path(&project)?;
    if !path.exists() {
        return Ok(empty_mood_board());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read mood board: {e}"))?;
    let mut doc: MoodBoardDocument =
        serde_json::from_str(&raw).map_err(|e| format!("parse mood board: {e}"))?;
    // Drop malformed ids from tampered boards; keep the rest usable.
    doc.items.retain(|item| {
        validate_entity_id(&item.id, "mood board item").is_ok()
            && validate_entity_id(&item.asset_id, "asset").is_ok()
    });
    if doc.items.len() > MAX_MOOD_BOARD_ITEMS {
        doc.items.truncate(MAX_MOOD_BOARD_ITEMS);
    }
    for item in &mut doc.items {
        item.comment = sanitize_mood_comment(&item.comment);
        item.crop = item.crop.take().and_then(sanitize_mood_crop);
        item.border = item.border.take().and_then(sanitize_mood_border);
    }
    Ok(doc)
}

pub fn save_mood_board(
    app: &AppHandle,
    project_id: String,
    document: MoodBoardDocument,
) -> Result<MoodBoardDocument, String> {
    let project = project_by_id(app, &project_id)?;
    let mut document = document;
    document.format = "gdd-studio-mood-board".into();
    document.version = 1;
    normalize_mood_board_items(&mut document.items)?;
    write_json(&mood_board_path(&project)?, &document)?;
    Ok(document)
}

// ── Templates (app-level + project-level) ──────────────────────────────────

const TEMPLATES_DIR: &str = "templates";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateRecord {
    pub id: String,
    pub name: String,
    /// "app" or "project"
    pub scope: String,
    pub body: serde_json::Value,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub project_id: Option<String>,
}

fn app_templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(TEMPLATES_DIR))
}

fn project_templates_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(TEMPLATES_DIR)
}

fn template_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    validate_entity_id(id, "template")?;
    let id = id.trim();
    let path = dir.join(format!("{id}.json"));
    ensure_path_within(dir, &path)?;
    Ok(path)
}

fn read_templates_dir(dir: &Path, scope: &str, project_id: Option<&str>) -> Result<Vec<TemplateRecord>, String> {
    let mut items = Vec::new();
    if !dir.is_dir() {
        return Ok(items);
    }
    for entry in fs::read_dir(dir).map_err(|e| format!("read templates: {e}"))? {
        let entry = entry.map_err(|e| format!("read templates entry: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if let Ok(mut t) = serde_json::from_str::<TemplateRecord>(&raw) {
            t.scope = scope.to_string();
            t.project_id = project_id.map(|s| s.to_string());
            items.push(t);
        }
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

pub fn list_templates(
    app: &AppHandle,
    project_id: Option<String>,
) -> Result<Vec<TemplateRecord>, String> {
    let mut items = read_templates_dir(&app_templates_dir(app)?, "app", None)?;
    if let Some(pid) = project_id {
        let project = project_by_id(app, &pid)?;
        items.extend(read_templates_dir(
            &project_templates_dir(&project),
            "project",
            Some(&pid),
        )?);
    }
    Ok(items)
}

pub fn save_template(
    app: &AppHandle,
    name: String,
    body: serde_json::Value,
    scope: String,
    project_id: Option<String>,
    template_id: Option<String>,
) -> Result<TemplateRecord, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Template name is required".into());
    }
    let scope = if scope == "project" { "project" } else { "app" };
    let dir = if scope == "project" {
        let pid = project_id
            .as_ref()
            .ok_or_else(|| "projectId required for project templates".to_string())?;
        let project = project_by_id(app, pid)?;
        project_templates_dir(&project)
    } else {
        app_templates_dir(app)?
    };
    fs::create_dir_all(&dir).map_err(|e| format!("create templates dir: {e}"))?;

    let id = template_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = now_secs();
    let existing = template_path(&dir, &id)?;
    let created_at = if existing.is_file() {
        fs::read_to_string(&existing)
            .ok()
            .and_then(|r| serde_json::from_str::<TemplateRecord>(&r).ok())
            .map(|t| t.created_at)
            .unwrap_or(now)
    } else {
        now
    };

    let record = TemplateRecord {
        id: id.clone(),
        name,
        scope: scope.to_string(),
        body,
        created_at,
        updated_at: now,
        project_id: if scope == "project" {
            project_id
        } else {
            None
        },
    };
    write_json(&template_path(&dir, &id)?, &record)?;
    Ok(record)
}

pub fn delete_template(
    app: &AppHandle,
    template_id: String,
    scope: String,
    project_id: Option<String>,
) -> Result<(), String> {
    let dir = if scope == "project" {
        let pid = project_id
            .as_ref()
            .ok_or_else(|| "projectId required for project templates".to_string())?;
        let project = project_by_id(app, pid)?;
        project_templates_dir(&project)
    } else {
        app_templates_dir(app)?
    };
    let path = template_path(&dir, &template_id)?;
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("delete template: {e}"))?;
    }
    Ok(())
}

pub fn load_template(
    app: &AppHandle,
    template_id: String,
    scope: String,
    project_id: Option<String>,
) -> Result<TemplateRecord, String> {
    let dir = if scope == "project" {
        let pid = project_id
            .as_ref()
            .ok_or_else(|| "projectId required for project templates".to_string())?;
        let project = project_by_id(app, pid)?;
        project_templates_dir(&project)
    } else {
        app_templates_dir(app)?
    };
    let path = template_path(&dir, &template_id)?;
    if !path.is_file() {
        return Err(format!("Unknown template id: {template_id}"));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read template: {e}"))?;
    let mut t: TemplateRecord =
        serde_json::from_str(&raw).map_err(|e| format!("parse template: {e}"))?;
    t.scope = if scope == "project" {
        "project".into()
    } else {
        "app".into()
    };
    t.project_id = project_id;
    Ok(t)
}

/// Write a UTF-8 export HTML file under app cache for print/PDF workflows.
pub fn write_export_html(app: &AppHandle, html: String) -> Result<String, String> {
    if html.len() > MAX_EXPORT_HTML_BYTES {
        return Err(format!(
            "Export HTML exceeds {} MB limit",
            MAX_EXPORT_HTML_BYTES / (1024 * 1024)
        ));
    }
    let dir = data_dir(app)?.join("exports");
    fs::create_dir_all(&dir).map_err(|e| format!("create exports dir: {e}"))?;
    let path = dir.join(format!("export-{}.html", now_secs()));
    let path = ensure_path_within(&dir, &path)?;
    fs::write(&path, html.as_bytes()).map_err(|e| format!("write export html: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}
