//! Local persistence for the project library, settings, and on-disk project
//! payloads (docs, flowcharts, RGD sheets, mood boards, charts, assets, templates).
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
#[serde(rename_all = "camelCase", default)]
pub struct WindowGeometryFile {
    pub launcher: Option<WindowGeometry>,
    pub editor: Option<WindowGeometry>,
    /// Separate Options webview (`label = "options"`).
    pub options: Option<WindowGeometry>,
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
    /// Paper size id for Print view + PDF (`letter`, `a4`, `legal`, …).
    #[serde(default = "default_paper_size")]
    pub paper_size: String,
}

fn default_paper_size() -> String {
    "letter".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            automatic_updates: true,
            last_update_check_at: None,
            display_variable_names: false,
            paper_size: default_paper_size(),
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
const MAX_EXPORT_PDF_BYTES: usize = 64 * 1024 * 1024;
const MAX_MOOD_BOARD_ITEMS: usize = 500;
const MAX_MOOD_COMMENT_CHARS: usize = 2_000;
const MAX_CHART_SERIES: usize = 24;
const MAX_CHART_ROWS: usize = 2_000;
const MAX_CHART_LABEL_CHARS: usize = 120;
const MAX_CHART_DESCRIPTION_CHARS: usize = 2_000;
const MAX_WHITEBOARD_OBJECTS: usize = 2_000;
const MAX_WHITEBOARD_PATH_POINTS: usize = 4_000;
const MAX_WHITEBOARD_DESCRIPTION_CHARS: usize = 2_000;
const MAX_WHITEBOARD_LAYERS: usize = 32;
const MAX_WHITEBOARD_LAYER_NAME_CHARS: usize = 64;

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
    #[serde(default)]
    pub description: String,
}

pub fn project_by_id(app: &AppHandle, project_id: &str) -> Result<ProjectRecord, String> {
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
            let parsed = fs::read_to_string(&path)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
            let name = parsed
                .as_ref()
                .and_then(|v| {
                    v.get("name")
                        .and_then(|n| n.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| id.clone());
            let description = parsed
                .as_ref()
                .and_then(|v| {
                    v.get("description")
                        .and_then(|d| d.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            items.push(FlowchartSummary {
                id,
                name,
                description,
            });
        }
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    if items.is_empty() {
        items.push(FlowchartSummary {
            id: "main".into(),
            name: "Main".into(),
            description: String::new(),
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
    let mut value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("parse flowchart: {e}"))?;
    normalize_flowchart_doc(&mut value);
    Ok(value)
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
    let mut document = document;
    normalize_flowchart_doc(&mut document);
    write_json(&path, &document)
}

fn normalize_flowchart_doc(value: &mut serde_json::Value) {
    if let Some(obj) = value.as_object_mut() {
        if !obj.contains_key("description")
            || !obj
                .get("description")
                .map(|v| v.is_string())
                .unwrap_or(false)
        {
            obj.insert("description".into(), serde_json::json!(""));
        }
    }
}

fn empty_flowchart_doc(id: &str) -> serde_json::Value {
    serde_json::json!({
        "format": "gdd-studio-flowchart",
        "version": 2,
        "id": id,
        "name": if id == "main" { "Main" } else { id },
        "description": "",
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
const EXPORTS_DIR: &str = "exports";
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

// ── Mood Board (named library, like flowcharts) ────────────────────────────

const MOOD_BOARDS_DIR: &str = "mood-boards";
/// Legacy single-board file; migrated into mood-boards/main.json on first access.
const LEGACY_MOOD_BOARD_FILE: &str = "mood-board.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodBoardSummary {
    pub id: String,
    pub name: String,
}

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
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub items: Vec<MoodBoardItem>,
}

fn mood_boards_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(MOOD_BOARDS_DIR)
}

fn mood_board_path(project: &ProjectRecord, board_id: &str) -> Result<PathBuf, String> {
    validate_entity_id(board_id, "mood board")?;
    let id = board_id.trim();
    let dir = mood_boards_dir(project);
    let path = dir.join(format!("{id}.json"));
    ensure_path_within(&dir, &path)?;
    Ok(path)
}

fn legacy_mood_board_path(project: &ProjectRecord) -> Result<PathBuf, String> {
    let root = PathBuf::from(&project.path);
    let path = root.join(LEGACY_MOOD_BOARD_FILE);
    ensure_path_within(&root, &path)
}

fn empty_mood_board(id: &str) -> MoodBoardDocument {
    MoodBoardDocument {
        format: "gdd-studio-mood-board".into(),
        version: 2,
        id: id.into(),
        name: if id == "main" {
            "Main".into()
        } else {
            id.into()
        },
        items: Vec::new(),
    }
}

/// Move legacy root mood-board.json into mood-boards/main.json once.
fn migrate_legacy_mood_board(project: &ProjectRecord) -> Result<(), String> {
    let legacy = legacy_mood_board_path(project)?;
    if !legacy.is_file() {
        return Ok(());
    }
    let main_path = mood_board_path(project, "main")?;
    if main_path.is_file() {
        // Library already present — leave legacy file for manual cleanup.
        return Ok(());
    }
    let raw = fs::read_to_string(&legacy).map_err(|e| format!("read legacy mood board: {e}"))?;
    let mut doc: MoodBoardDocument =
        serde_json::from_str(&raw).map_err(|e| format!("parse legacy mood board: {e}"))?;
    doc.format = "gdd-studio-mood-board".into();
    doc.version = 2;
    doc.id = "main".into();
    if doc.name.trim().is_empty() {
        doc.name = "Main".into();
    }
    sanitize_mood_board_doc(&mut doc);
    if let Some(parent) = main_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create mood-boards dir: {e}"))?;
    }
    write_json(&main_path, &doc)?;
    // Keep legacy file renamed so re-open is idempotent and data isn't lost on write failure.
    let backup = legacy.with_extension("json.bak");
    let _ = fs::rename(&legacy, &backup);
    Ok(())
}

fn sanitize_mood_board_doc(doc: &mut MoodBoardDocument) {
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

pub fn list_mood_boards(
    app: &AppHandle,
    project_id: String,
) -> Result<Vec<MoodBoardSummary>, String> {
    let project = project_by_id(app, &project_id)?;
    migrate_legacy_mood_board(&project)?;
    let dir = mood_boards_dir(&project);
    let mut items = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("read mood-boards: {e}"))? {
            let entry = entry.map_err(|e| format!("read mood-boards entry: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("untitled")
                .to_string();
            if validate_entity_id(&id, "mood board").is_err() {
                continue;
            }
            let name = fs::read_to_string(&path)
                .ok()
                .and_then(|raw| serde_json::from_str::<MoodBoardDocument>(&raw).ok())
                .map(|doc| {
                    if doc.name.trim().is_empty() {
                        if id == "main" {
                            "Main".into()
                        } else {
                            id.clone()
                        }
                    } else {
                        doc.name
                    }
                })
                .unwrap_or_else(|| {
                    if id == "main" {
                        "Main".into()
                    } else {
                        id.clone()
                    }
                });
            items.push(MoodBoardSummary { id, name });
        }
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    if items.is_empty() {
        items.push(MoodBoardSummary {
            id: "main".into(),
            name: "Main".into(),
        });
    }
    Ok(items)
}

pub fn load_mood_board(
    app: &AppHandle,
    project_id: String,
    board_id: String,
) -> Result<MoodBoardDocument, String> {
    let project = project_by_id(app, &project_id)?;
    migrate_legacy_mood_board(&project)?;
    let path = mood_board_path(&project, &board_id)?;
    if !path.exists() {
        return Ok(empty_mood_board(&board_id));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read mood board: {e}"))?;
    let mut doc: MoodBoardDocument =
        serde_json::from_str(&raw).map_err(|e| format!("parse mood board: {e}"))?;
    sanitize_mood_board_doc(&mut doc);
    if doc.id.trim().is_empty() {
        doc.id = board_id.trim().to_string();
    }
    if doc.name.trim().is_empty() {
        doc.name = if board_id.trim() == "main" {
            "Main".into()
        } else {
            board_id.trim().to_string()
        };
    }
    Ok(doc)
}

pub fn save_mood_board(
    app: &AppHandle,
    project_id: String,
    board_id: String,
    document: MoodBoardDocument,
) -> Result<MoodBoardDocument, String> {
    let project = project_by_id(app, &project_id)?;
    migrate_legacy_mood_board(&project)?;
    let mut document = document;
    document.format = "gdd-studio-mood-board".into();
    document.version = 2;
    document.id = board_id.trim().to_string();
    if document.name.trim().is_empty() {
        document.name = if document.id == "main" {
            "Main".into()
        } else {
            document.id.clone()
        };
    }
    normalize_mood_board_items(&mut document.items)?;
    let path = mood_board_path(&project, &board_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create mood-boards dir: {e}"))?;
    }
    write_json(&path, &document)?;
    Ok(document)
}

pub fn mood_board_exists(
    app: &AppHandle,
    project_id: String,
    board_id: String,
) -> Result<bool, String> {
    let project = project_by_id(app, &project_id)?;
    migrate_legacy_mood_board(&project)?;
    let path = mood_board_path(&project, &board_id)?;
    Ok(path.is_file())
}

pub fn delete_mood_board(
    app: &AppHandle,
    project_id: String,
    board_id: String,
) -> Result<(), String> {
    let id = board_id.trim();
    if id == "main" {
        return Err("Main mood board cannot be deleted".into());
    }
    let project = project_by_id(app, &project_id)?;
    migrate_legacy_mood_board(&project)?;
    let path = mood_board_path(&project, id)?;
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("delete mood board: {e}"))?;
    }
    Ok(())
}

// ── Charts (named library; guttable MVP) ───────────────────────────────────

const CHARTS_DIR: &str = "charts";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSeries {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartRow {
    pub id: String,
    /// Number or string X value (JSON number / string).
    pub x: serde_json::Value,
    /// seriesId → number | null
    #[serde(default)]
    pub y: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartDocument {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_chart_type")]
    pub chart_type: String,
    #[serde(default = "default_x_label")]
    pub x_label: String,
    #[serde(default = "default_y_label")]
    pub y_label: String,
    #[serde(default)]
    pub series: Vec<ChartSeries>,
    #[serde(default)]
    pub rows: Vec<ChartRow>,
}

fn default_chart_type() -> String {
    "line".into()
}

fn default_x_label() -> String {
    "Level".into()
}

fn default_y_label() -> String {
    "Value".into()
}

fn charts_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(CHARTS_DIR)
}

fn chart_path(project: &ProjectRecord, chart_id: &str) -> Result<PathBuf, String> {
    validate_entity_id(chart_id, "chart")?;
    let id = chart_id.trim();
    let dir = charts_dir(project);
    let path = dir.join(format!("{id}.json"));
    ensure_path_within(&dir, &path)?;
    Ok(path)
}

fn empty_chart(id: &str) -> ChartDocument {
    ChartDocument {
        format: "gdd-studio-chart".into(),
        version: 1,
        id: id.into(),
        name: if id == "main" {
            "Main".into()
        } else {
            id.into()
        },
        description: String::new(),
        chart_type: "line".into(),
        x_label: "Level".into(),
        y_label: "Value".into(),
        series: vec![ChartSeries {
            id: "series-1".into(),
            name: "Series 1".into(),
            color: None,
        }],
        rows: Vec::new(),
    }
}

fn sanitize_chart_label(label: &str, fallback: &str) -> String {
    let t: String = label
        .trim()
        .chars()
        .take(MAX_CHART_LABEL_CHARS)
        .collect();
    if t.is_empty() {
        fallback.into()
    } else {
        t
    }
}

fn sanitize_chart_description(description: &str) -> String {
    description
        .trim()
        .chars()
        .take(MAX_CHART_DESCRIPTION_CHARS)
        .collect()
}

fn sanitize_chart_color(color: &Option<String>) -> Option<String> {
    let Some(raw) = color else {
        return None;
    };
    let t = raw.trim();
    if t.is_empty() || t.len() > 32 {
        return None;
    }
    let ok = t.starts_with('#')
        || t.starts_with("rgb(")
        || t.starts_with("rgba(")
        || t.chars().all(|c| c.is_ascii_alphanumeric() || "-_".contains(c));
    if ok {
        Some(t.to_string())
    } else {
        None
    }
}

fn sanitize_chart_x(x: serde_json::Value) -> serde_json::Value {
    match x {
        serde_json::Value::Number(n) => {
            if n.as_f64().map(f64::is_finite).unwrap_or(false) {
                serde_json::Value::Number(n)
            } else {
                serde_json::Value::Number(serde_json::Number::from(0))
            }
        }
        serde_json::Value::String(s) => {
            let t: String = s.chars().take(MAX_CHART_LABEL_CHARS).collect();
            serde_json::Value::String(t)
        }
        serde_json::Value::Null => serde_json::Value::String(String::new()),
        other => serde_json::Value::String(other.to_string()),
    }
}

fn sanitize_chart_y_map(
    y: &serde_json::Map<String, serde_json::Value>,
    series_ids: &std::collections::HashSet<String>,
) -> serde_json::Map<String, serde_json::Value> {
    let mut out = serde_json::Map::new();
    for id in series_ids {
        let val = match y.get(id) {
            Some(serde_json::Value::Null) | None => serde_json::Value::Null,
            Some(serde_json::Value::Number(n))
                if n.as_f64().map(f64::is_finite).unwrap_or(false) =>
            {
                serde_json::Value::Number(n.clone())
            }
            Some(serde_json::Value::String(s)) => {
                let t = s.trim();
                if t.is_empty() {
                    serde_json::Value::Null
                } else if let Ok(n) = t.parse::<f64>() {
                    if n.is_finite() {
                        serde_json::Number::from_f64(n)
                            .map(serde_json::Value::Number)
                            .unwrap_or(serde_json::Value::Null)
                    } else {
                        serde_json::Value::Null
                    }
                } else {
                    serde_json::Value::Null
                }
            }
            _ => serde_json::Value::Null,
        };
        out.insert(id.clone(), val);
    }
    out
}

fn sanitize_chart_doc(doc: &mut ChartDocument) {
    doc.format = "gdd-studio-chart".into();
    doc.version = 1;
    doc.description = sanitize_chart_description(&doc.description);
    doc.x_label = sanitize_chart_label(&doc.x_label, "Level");
    doc.y_label = sanitize_chart_label(&doc.y_label, "Value");
    doc.chart_type = if doc.chart_type.trim().eq_ignore_ascii_case("bar") {
        "bar".into()
    } else {
        "line".into()
    };

    doc.series.retain(|s| validate_entity_id(&s.id, "chart series").is_ok());
    if doc.series.is_empty() {
        doc.series.push(ChartSeries {
            id: "series-1".into(),
            name: "Series 1".into(),
            color: None,
        });
    }
    if doc.series.len() > MAX_CHART_SERIES {
        doc.series.truncate(MAX_CHART_SERIES);
    }
    for (i, series) in doc.series.iter_mut().enumerate() {
        series.name = sanitize_chart_label(&series.name, &format!("Series {}", i + 1));
        series.color = sanitize_chart_color(&series.color);
    }

    let series_ids: std::collections::HashSet<String> =
        doc.series.iter().map(|s| s.id.clone()).collect();
    doc.rows.retain(|r| validate_entity_id(&r.id, "chart row").is_ok());
    if doc.rows.len() > MAX_CHART_ROWS {
        doc.rows.truncate(MAX_CHART_ROWS);
    }
    for row in &mut doc.rows {
        row.x = sanitize_chart_x(std::mem::take(&mut row.x));
        row.y = sanitize_chart_y_map(&row.y, &series_ids);
    }
}

pub fn list_charts(
    app: &AppHandle,
    project_id: String,
) -> Result<Vec<ChartSummary>, String> {
    let project = project_by_id(app, &project_id)?;
    let dir = charts_dir(&project);
    let mut items = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("read charts: {e}"))? {
            let entry = entry.map_err(|e| format!("read charts entry: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("untitled")
                .to_string();
            if validate_entity_id(&id, "chart").is_err() {
                continue;
            }
            let name = fs::read_to_string(&path)
                .ok()
                .and_then(|raw| serde_json::from_str::<ChartDocument>(&raw).ok())
                .map(|doc| {
                    if doc.name.trim().is_empty() {
                        if id == "main" {
                            "Main".into()
                        } else {
                            id.clone()
                        }
                    } else {
                        doc.name
                    }
                })
                .unwrap_or_else(|| {
                    if id == "main" {
                        "Main".into()
                    } else {
                        id.clone()
                    }
                });
            items.push(ChartSummary { id, name });
        }
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    if items.is_empty() {
        items.push(ChartSummary {
            id: "main".into(),
            name: "Main".into(),
        });
    }
    Ok(items)
}

pub fn load_chart(
    app: &AppHandle,
    project_id: String,
    chart_id: String,
) -> Result<ChartDocument, String> {
    let project = project_by_id(app, &project_id)?;
    let path = chart_path(&project, &chart_id)?;
    if !path.exists() {
        return Ok(empty_chart(&chart_id));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read chart: {e}"))?;
    let mut doc: ChartDocument =
        serde_json::from_str(&raw).map_err(|e| format!("parse chart: {e}"))?;
    sanitize_chart_doc(&mut doc);
    if doc.id.trim().is_empty() {
        doc.id = chart_id.trim().to_string();
    }
    if doc.name.trim().is_empty() {
        doc.name = if chart_id.trim() == "main" {
            "Main".into()
        } else {
            chart_id.trim().to_string()
        };
    }
    Ok(doc)
}

pub fn save_chart(
    app: &AppHandle,
    project_id: String,
    chart_id: String,
    document: ChartDocument,
) -> Result<ChartDocument, String> {
    let project = project_by_id(app, &project_id)?;
    let mut document = document;
    document.id = chart_id.trim().to_string();
    if document.name.trim().is_empty() {
        document.name = if document.id == "main" {
            "Main".into()
        } else {
            document.id.clone()
        };
    }
    sanitize_chart_doc(&mut document);
    let path = chart_path(&project, &chart_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create charts dir: {e}"))?;
    }
    write_json(&path, &document)?;
    Ok(document)
}

pub fn chart_exists(
    app: &AppHandle,
    project_id: String,
    chart_id: String,
) -> Result<bool, String> {
    let project = project_by_id(app, &project_id)?;
    let path = chart_path(&project, &chart_id)?;
    Ok(path.is_file())
}

pub fn delete_chart(
    app: &AppHandle,
    project_id: String,
    chart_id: String,
) -> Result<(), String> {
    let id = chart_id.trim();
    if id == "main" {
        return Err("Main graph cannot be deleted".into());
    }
    let project = project_by_id(app, &project_id)?;
    let path = chart_path(&project, id)?;
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("delete chart: {e}"))?;
    }
    Ok(())
}

// ── Whiteboards (named doodle library; lean MVP) ───────────────────────────

const WHITEBOARDS_DIR: &str = "whiteboards";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteboardSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteboardPoint {
    pub x: f64,
    pub y: f64,
    /// Pointer Events `pressure` (0–1). Mouse/fallback is typically 0.5.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pressure: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteboardPaletteRef {
    pub mood_board_id: String,
    pub item_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteboardViewport {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default = "default_whiteboard_zoom")]
    pub zoom: f64,
}

fn default_whiteboard_zoom() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteboardLayer {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "default_whiteboard_layer_opacity")]
    pub opacity: f64,
}

fn default_true() -> bool {
    true
}

fn default_whiteboard_layer_opacity() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteboardObject {
    pub id: String,
    pub kind: String,
    /// Owning layer id. Empty on legacy boards — filled during sanitize.
    #[serde(default)]
    pub layer_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<WhiteboardPoint>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x1: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y1: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x2: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y2: Option<f64>,
    /// Text object top-left (world units).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    /// Text rotation in radians about the block center.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default)]
    pub color: String,
    #[serde(default = "default_whiteboard_width")]
    pub width: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    /// Freehand brush: hard | soft | highlighter (paths only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brush: Option<String>,
    /// Stroke opacity 0–1 (paths).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    /// Stroke flow 0–1 (paths); multiplies with opacity when rendering.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow: Option<f64>,
}

fn default_whiteboard_width() -> f64 {
    3.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhiteboardDocument {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Paint stack; index 0 = bottom. Migrated for legacy boards.
    #[serde(default)]
    pub layers: Vec<WhiteboardLayer>,
    #[serde(default)]
    pub active_layer_id: String,
    #[serde(default)]
    pub objects: Vec<WhiteboardObject>,
    #[serde(default)]
    pub viewport: WhiteboardViewport,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub palette_ref: Option<WhiteboardPaletteRef>,
}

impl Default for WhiteboardViewport {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}

fn whiteboards_dir(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join(WHITEBOARDS_DIR)
}

fn whiteboard_path(project: &ProjectRecord, whiteboard_id: &str) -> Result<PathBuf, String> {
    validate_entity_id(whiteboard_id, "whiteboard")?;
    let id = whiteboard_id.trim();
    let dir = whiteboards_dir(project);
    let path = dir.join(format!("{id}.json"));
    ensure_path_within(&dir, &path)?;
    Ok(path)
}

fn default_whiteboard_layer() -> WhiteboardLayer {
    WhiteboardLayer {
        id: "layer-main".into(),
        name: "Layer 1".into(),
        visible: true,
        locked: false,
        opacity: 1.0,
    }
}

fn empty_whiteboard(id: &str) -> WhiteboardDocument {
    let layer = default_whiteboard_layer();
    let active_layer_id = layer.id.clone();
    WhiteboardDocument {
        format: "gdd-studio-whiteboard".into(),
        version: 2,
        id: id.into(),
        name: if id == "main" {
            "Main".into()
        } else {
            id.into()
        },
        description: String::new(),
        layers: vec![layer],
        active_layer_id,
        objects: Vec::new(),
        viewport: WhiteboardViewport::default(),
        palette_ref: None,
    }
}

fn sanitize_whiteboard_color(raw: &str, fallback: &str) -> String {
    let t = raw.trim();
    if t.is_empty() || t.len() > 32 {
        return fallback.into();
    }
    if t.starts_with('#')
        || t.starts_with("rgb(")
        || t.starts_with("rgba(")
        || t.chars().all(|c| c.is_ascii_alphabetic() || c == '-')
    {
        t.to_string()
    } else {
        fallback.into()
    }
}

fn sanitize_whiteboard_width(width: f64) -> f64 {
    if !width.is_finite() {
        return 3.0;
    }
    width.clamp(1.0, 48.0)
}

fn sanitize_finite(n: Option<f64>) -> Option<f64> {
    n.filter(|v| v.is_finite())
}

fn sanitize_whiteboard_layer_opacity(opacity: f64) -> f64 {
    if !opacity.is_finite() {
        return 1.0;
    }
    (opacity.clamp(0.0, 1.0) * 100.0).round() / 100.0
}

fn sanitize_whiteboard_stroke_alpha(raw: Option<f64>) -> Option<f64> {
    let Some(n) = raw else {
        return None;
    };
    if !n.is_finite() {
        return None;
    }
    Some(((n.clamp(0.05, 1.0)) * 100.0).round() / 100.0)
}

fn sanitize_whiteboard_brush(raw: Option<String>) -> Option<String> {
    match raw
        .as_deref()
        .map(|s| s.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("soft") => Some("soft".into()),
        Some("highlighter") => Some("highlighter".into()),
        Some("hard") | None => None, // hard is the default — omit
        Some(_) => None,
    }
}

fn sanitize_whiteboard_layers(doc: &mut WhiteboardDocument) -> String {
    let mut cleaned = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (index, mut layer) in doc.layers.drain(..).enumerate() {
        layer.id = layer.id.trim().to_string();
        if layer.id.is_empty() || validate_entity_id(&layer.id, "whiteboard layer").is_err() {
            continue;
        }
        if !seen.insert(layer.id.clone()) {
            continue;
        }
        let name = layer.name.trim().chars().take(MAX_WHITEBOARD_LAYER_NAME_CHARS).collect::<String>();
        layer.name = if name.is_empty() {
            format!("Layer {}", index + 1)
        } else {
            name
        };
        layer.opacity = sanitize_whiteboard_layer_opacity(layer.opacity);
        cleaned.push(layer);
        if cleaned.len() >= MAX_WHITEBOARD_LAYERS {
            break;
        }
    }
    if cleaned.is_empty() {
        cleaned.push(default_whiteboard_layer());
    }
    let fallback_id = cleaned[0].id.clone();
    let active = doc.active_layer_id.trim().to_string();
    doc.active_layer_id = if cleaned.iter().any(|l| l.id == active) {
        active
    } else {
        fallback_id.clone()
    };
    doc.layers = cleaned;
    fallback_id
}

fn sanitize_whiteboard_font_size(raw: Option<f64>) -> f64 {
    let n = raw.unwrap_or(24.0);
    if !n.is_finite() {
        return 24.0;
    }
    (n.clamp(8.0, 128.0) * 10.0).round() / 10.0
}

fn sanitize_whiteboard_object(obj: &mut WhiteboardObject, fallback_layer_id: &str) -> bool {
    if validate_entity_id(&obj.id, "whiteboard object").is_err() {
        return false;
    }
    let kind = obj.kind.trim().to_ascii_lowercase();
    match kind.as_str() {
        "path" => {
            obj.kind = "path".into();
            let mode = obj
                .mode
                .as_deref()
                .unwrap_or("pen")
                .trim()
                .to_ascii_lowercase();
            obj.mode = Some(if mode == "eraser" {
                "eraser".into()
            } else {
                "pen".into()
            });
            let mut points = obj.points.take().unwrap_or_default();
            points.retain(|p| p.x.is_finite() && p.y.is_finite());
            if points.len() > MAX_WHITEBOARD_PATH_POINTS {
                points.truncate(MAX_WHITEBOARD_PATH_POINTS);
            }
            if points.is_empty() {
                return false;
            }
            obj.points = Some(points);
            obj.x1 = None;
            obj.y1 = None;
            obj.x2 = None;
            obj.y2 = None;
            obj.x = None;
            obj.y = None;
            obj.text = None;
            obj.font_size = None;
            obj.rotation = None;
            obj.fill = None;
            obj.brush = sanitize_whiteboard_brush(obj.brush.take());
            obj.opacity = sanitize_whiteboard_stroke_alpha(obj.opacity.take());
            obj.flow = sanitize_whiteboard_stroke_alpha(obj.flow.take());
        }
        "line" | "rect" | "ellipse" => {
            obj.kind = kind.clone();
            obj.mode = None;
            obj.points = None;
            obj.brush = None;
            obj.opacity = None;
            obj.flow = None;
            obj.x = None;
            obj.y = None;
            obj.text = None;
            obj.font_size = None;
            obj.rotation = None;
            let x1 = sanitize_finite(obj.x1);
            let y1 = sanitize_finite(obj.y1);
            let x2 = sanitize_finite(obj.x2);
            let y2 = sanitize_finite(obj.y2);
            if x1.is_none() || y1.is_none() || x2.is_none() || y2.is_none() {
                return false;
            }
            obj.x1 = x1;
            obj.y1 = y1;
            obj.x2 = x2;
            obj.y2 = y2;
            if let Some(fill) = obj.fill.take() {
                let t = fill.trim();
                obj.fill = if t.is_empty() {
                    None
                } else {
                    Some(sanitize_whiteboard_color(t, "#1A1A1A"))
                };
            }
        }
        "text" => {
            obj.kind = "text".into();
            obj.mode = None;
            obj.points = None;
            obj.brush = None;
            obj.opacity = None;
            obj.flow = None;
            obj.x1 = None;
            obj.y1 = None;
            obj.x2 = None;
            obj.y2 = None;
            obj.fill = None;
            let x = sanitize_finite(obj.x);
            let y = sanitize_finite(obj.y);
            if x.is_none() || y.is_none() {
                return false;
            }
            obj.x = x;
            obj.y = y;
            let text = obj
                .text
                .take()
                .unwrap_or_default()
                .replace("\r\n", "\n")
                .chars()
                .take(2_000)
                .collect::<String>();
            if text.trim().is_empty() {
                return false;
            }
            obj.text = Some(text);
            obj.font_size = Some(sanitize_whiteboard_font_size(obj.font_size.take()));
            if let Some(rot) = obj.rotation.take() {
                if rot.is_finite() && rot.abs() > 1e-6 {
                    // Keep in (-π, π]
                    let two_pi = std::f64::consts::PI * 2.0;
                    let mut r = ((rot + std::f64::consts::PI) % two_pi + two_pi) % two_pi
                        - std::f64::consts::PI;
                    if r.abs() > 1e-6 {
                        r = (r * 1000.0).round() / 1000.0;
                        obj.rotation = Some(r);
                    }
                }
            }
            // Width unused for text; keep a sane default for schema compatibility.
            obj.width = sanitize_whiteboard_width(obj.width);
        }
        _ => return false,
    }
    obj.layer_id = obj.layer_id.trim().to_string();
    if obj.layer_id.is_empty() || validate_entity_id(&obj.layer_id, "whiteboard layer").is_err()
    {
        obj.layer_id = fallback_layer_id.to_string();
    }
    obj.color = sanitize_whiteboard_color(&obj.color, "#1A1A1A");
    if kind != "text" {
        obj.width = sanitize_whiteboard_width(obj.width);
    }
    true
}

fn sanitize_whiteboard_doc(doc: &mut WhiteboardDocument) {
    doc.format = "gdd-studio-whiteboard".into();
    doc.version = 2;
    doc.description = doc
        .description
        .trim()
        .chars()
        .take(MAX_WHITEBOARD_DESCRIPTION_CHARS)
        .collect();
    let fallback_layer_id = sanitize_whiteboard_layers(doc);
    let layer_ids: std::collections::HashSet<String> =
        doc.layers.iter().map(|l| l.id.clone()).collect();
    doc.objects.retain_mut(|obj| {
        if !sanitize_whiteboard_object(obj, &fallback_layer_id) {
            return false;
        }
        if !layer_ids.contains(&obj.layer_id) {
            obj.layer_id = fallback_layer_id.clone();
        }
        true
    });
    if doc.objects.len() > MAX_WHITEBOARD_OBJECTS {
        doc.objects.truncate(MAX_WHITEBOARD_OBJECTS);
    }
    if !doc.viewport.zoom.is_finite() || doc.viewport.zoom <= 0.0 {
        doc.viewport.zoom = 1.0;
    } else {
        doc.viewport.zoom = doc.viewport.zoom.clamp(0.25, 4.0);
    }
    if !doc.viewport.x.is_finite() {
        doc.viewport.x = 0.0;
    }
    if !doc.viewport.y.is_finite() {
        doc.viewport.y = 0.0;
    }
    if let Some(pref) = doc.palette_ref.as_mut() {
        pref.mood_board_id = pref.mood_board_id.trim().to_string();
        pref.item_id = pref.item_id.trim().to_string();
        if pref.mood_board_id.is_empty()
            || pref.item_id.is_empty()
            || validate_entity_id(&pref.mood_board_id, "mood board").is_err()
            || validate_entity_id(&pref.item_id, "mood board item").is_err()
        {
            doc.palette_ref = None;
        }
    }
}

pub fn list_whiteboards(
    app: &AppHandle,
    project_id: String,
) -> Result<Vec<WhiteboardSummary>, String> {
    let project = project_by_id(app, &project_id)?;
    let dir = whiteboards_dir(&project);
    let mut items = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("read whiteboards: {e}"))? {
            let entry = entry.map_err(|e| format!("read whiteboards entry: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("untitled")
                .to_string();
            if validate_entity_id(&id, "whiteboard").is_err() {
                continue;
            }
            let name = fs::read_to_string(&path)
                .ok()
                .and_then(|raw| serde_json::from_str::<WhiteboardDocument>(&raw).ok())
                .map(|doc| {
                    if doc.name.trim().is_empty() {
                        if id == "main" {
                            "Main".into()
                        } else {
                            id.clone()
                        }
                    } else {
                        doc.name
                    }
                })
                .unwrap_or_else(|| {
                    if id == "main" {
                        "Main".into()
                    } else {
                        id.clone()
                    }
                });
            items.push(WhiteboardSummary { id, name });
        }
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    if items.is_empty() {
        items.push(WhiteboardSummary {
            id: "main".into(),
            name: "Main".into(),
        });
    }
    Ok(items)
}

pub fn load_whiteboard(
    app: &AppHandle,
    project_id: String,
    whiteboard_id: String,
) -> Result<WhiteboardDocument, String> {
    let project = project_by_id(app, &project_id)?;
    let path = whiteboard_path(&project, &whiteboard_id)?;
    if !path.exists() {
        return Ok(empty_whiteboard(&whiteboard_id));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read whiteboard: {e}"))?;
    let mut doc: WhiteboardDocument =
        serde_json::from_str(&raw).map_err(|e| format!("parse whiteboard: {e}"))?;
    sanitize_whiteboard_doc(&mut doc);
    if doc.id.trim().is_empty() {
        doc.id = whiteboard_id.trim().to_string();
    }
    if doc.name.trim().is_empty() {
        doc.name = if whiteboard_id.trim() == "main" {
            "Main".into()
        } else {
            whiteboard_id.trim().to_string()
        };
    }
    Ok(doc)
}

pub fn save_whiteboard(
    app: &AppHandle,
    project_id: String,
    whiteboard_id: String,
    document: WhiteboardDocument,
) -> Result<WhiteboardDocument, String> {
    let project = project_by_id(app, &project_id)?;
    let mut document = document;
    document.id = whiteboard_id.trim().to_string();
    if document.name.trim().is_empty() {
        document.name = if document.id == "main" {
            "Main".into()
        } else {
            document.id.clone()
        };
    }
    sanitize_whiteboard_doc(&mut document);
    let path = whiteboard_path(&project, &whiteboard_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create whiteboards dir: {e}"))?;
    }
    write_json(&path, &document)?;
    Ok(document)
}

pub fn whiteboard_exists(
    app: &AppHandle,
    project_id: String,
    whiteboard_id: String,
) -> Result<bool, String> {
    let project = project_by_id(app, &project_id)?;
    let path = whiteboard_path(&project, &whiteboard_id)?;
    Ok(path.is_file())
}

pub fn delete_whiteboard(
    app: &AppHandle,
    project_id: String,
    whiteboard_id: String,
) -> Result<(), String> {
    let id = whiteboard_id.trim();
    if id == "main" {
        return Err("Main whiteboard cannot be deleted".into());
    }
    let project = project_by_id(app, &project_id)?;
    let path = whiteboard_path(&project, id)?;
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("delete whiteboard: {e}"))?;
    }
    Ok(())
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

/// Ensure `<project>/exports` exists and return its absolute path.
pub fn ensure_project_exports_dir(app: &AppHandle, project_id: String) -> Result<String, String> {
    let project = project_by_id(app, &project_id)?;
    let root = PathBuf::from(&project.path);
    if !root.is_dir() {
        return Err(format!("Project folder not found:\n{}", project.path));
    }
    let dir = root.join(EXPORTS_DIR);
    let dir = ensure_path_within(&root, &dir)?;
    fs::create_dir_all(&dir).map_err(|e| format!("create exports dir: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Suggested default path for a project archive zip (sibling of the project folder).
pub fn suggest_project_archive_path(
    app: &AppHandle,
    project_id: String,
) -> Result<String, String> {
    let project = project_by_id(app, &project_id)?;
    let root = PathBuf::from(&project.path);
    if !root.is_dir() {
        return Err(format!("Project folder not found:\n{}", project.path));
    }
    let parent = root
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| root.clone());
    let filename = format!("{}-archive.zip", sanitize_filename(&project.name));
    Ok(parent.join(filename).to_string_lossy().into_owned())
}

/// Zip `root` into `dest` (must end with `.zip`). Entries are rooted under `archive_root_name/`.
/// Skips `dest` and a sibling `.tmp` if they fall inside `root` mid-write.
fn zip_directory_to_file(
    root: &Path,
    dest: &Path,
    archive_root_name: &str,
) -> Result<PathBuf, String> {
    if !root.is_dir() {
        return Err(format!("Project folder not found:\n{}", root.display()));
    }
    let ext_ok = dest
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("zip"))
        .unwrap_or(false);
    if !ext_ok {
        return Err("Archive path must end with .zip".into());
    }

    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("create archive folder: {e}"))?;
        }
    }

    let temp = {
        let mut t = dest.to_path_buf();
        let stem = dest
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("archive.zip");
        t.set_file_name(format!("{stem}.tmp"));
        t
    };

    let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());

    let file = fs::File::create(&temp).map_err(|e| format!("create archive temp: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.add_directory(format!("{archive_root_name}/"), options)
        .map_err(|e| format!("zip root folder: {e}"))?;

    let mut skip: Vec<PathBuf> = vec![dest.to_path_buf(), temp.clone()];
    if let Ok(c) = fs::canonicalize(&temp) {
        skip.push(c);
    }
    if let Ok(c) = fs::canonicalize(dest) {
        skip.push(c);
    }

    for entry in walkdir::WalkDir::new(root).follow_links(false).into_iter() {
        let entry = entry.map_err(|e| format!("walk project folder: {e}"))?;
        let path = entry.path();
        let path_canon = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if skip.iter().any(|s| s == path || s == &path_canon) {
            continue;
        }

        let rel = match path.strip_prefix(&root_canon).or_else(|_| path.strip_prefix(root)) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if rel.as_os_str().is_empty() {
            continue;
        }

        let name = format!(
            "{}/{}",
            archive_root_name,
            rel.to_string_lossy().replace('\\', "/")
        );

        if entry.file_type().is_dir() {
            zip.add_directory(format!("{name}/"), options)
                .map_err(|e| format!("zip directory: {e}"))?;
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }

        zip.start_file(&name, options)
            .map_err(|e| format!("zip start file: {e}"))?;
        let mut src = fs::File::open(path).map_err(|e| format!("open for zip: {e}"))?;
        std::io::copy(&mut src, &mut zip).map_err(|e| format!("zip copy: {e}"))?;
    }

    zip.finish().map_err(|e| format!("finish zip: {e}"))?;

    if dest.exists() {
        fs::remove_file(dest).map_err(|e| format!("replace existing archive: {e}"))?;
    }
    fs::rename(&temp, dest).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("move archive into place: {e}")
    })?;

    Ok(dest.to_path_buf())
}

/// Zip the project folder to a user-chosen absolute `.zip` path (DIY backup; no OAuth).
///
/// Archive entries are rooted under `<project-name>/…`. If the destination sits
/// inside the project tree, that file (and a sibling `.tmp`) are skipped while walking.
pub fn export_project_archive(
    app: &AppHandle,
    project_id: String,
    dest_path: String,
) -> Result<String, String> {
    let project = project_by_id(app, &project_id)?;
    let root = PathBuf::from(&project.path);
    let trimmed = dest_path.trim();
    if trimmed.is_empty() {
        return Err("Archive path is empty".into());
    }
    let dest = PathBuf::from(trimmed);
    let archive_root_name = sanitize_filename(&project.name);
    let written = zip_directory_to_file(&root, &dest, &archive_root_name)?;
    Ok(written.to_string_lossy().into_owned())
}

#[cfg(test)]
mod archive_tests {
    use super::{sanitize_filename, zip_directory_to_file};
    use std::fs;
    use std::io::Read;

    #[test]
    fn zips_project_contents_under_named_root() {
        let dir = std::env::temp_dir().join(format!(
            "gdd-archive-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(dir.join("docs")).unwrap();
        fs::write(dir.join("gdd-studio.json"), b"{\"ok\":true}").unwrap();
        fs::write(dir.join("docs").join("main.json"), b"{\"title\":\"Main\"}").unwrap();

        let dest = dir.parent().unwrap().join(format!(
            "{}-archive.zip",
            sanitize_filename("Demo Game")
        ));
        let _ = fs::remove_file(&dest);

        let written = zip_directory_to_file(&dir, &dest, &sanitize_filename("Demo Game")).unwrap();
        assert_eq!(written, dest);
        assert!(dest.is_file());

        let file = fs::File::open(&dest).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert!(names.iter().any(|n| n == "Demo_Game/" || n == "Demo_Game"));
        assert!(names.iter().any(|n| n == "Demo_Game/gdd-studio.json"));
        assert!(names.iter().any(|n| n == "Demo_Game/docs/main.json"));

        let mut marker = String::new();
        archive
            .by_name("Demo_Game/gdd-studio.json")
            .unwrap()
            .read_to_string(&mut marker)
            .unwrap();
        assert!(marker.contains("ok"));

        let _ = fs::remove_file(&dest);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn skips_destination_when_saved_inside_project() {
        let dir = std::env::temp_dir().join(format!(
            "gdd-archive-inplace-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("note.txt"), b"hello").unwrap();
        let dest = dir.join("Demo_Game-archive.zip");
        let written = zip_directory_to_file(&dir, &dest, "Demo_Game").unwrap();
        assert_eq!(written, dest);

        let file = fs::File::open(&dest).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        for i in 0..archive.len() {
            let name = archive.by_index(i).unwrap().name().to_string();
            assert!(!name.ends_with(".zip"), "archive nested itself: {name}");
            assert!(!name.ends_with(".zip.tmp"), "temp nested: {name}");
        }

        let _ = fs::remove_dir_all(&dir);
    }
}

/// Write a PDF the user chose via the save dialog (absolute path ending in `.pdf`).
pub fn write_export_pdf(path: String, data_base64: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("PDF path is empty".into());
    }
    let path_buf = PathBuf::from(trimmed);
    let ext_ok = path_buf
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !ext_ok {
        return Err("PDF path must end with .pdf".into());
    }

    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        data_base64.trim(),
    )
    .map_err(|e| format!("decode PDF: {e}"))?;
    if bytes.is_empty() {
        return Err("PDF data is empty".into());
    }
    if bytes.len() > MAX_EXPORT_PDF_BYTES {
        return Err(format!(
            "PDF exceeds {} MB limit",
            MAX_EXPORT_PDF_BYTES / (1024 * 1024)
        ));
    }
    // Reject obvious non-PDF payloads before writing to a user-chosen path.
    if bytes.len() < 5 || &bytes[0..5] != b"%PDF-" {
        return Err("Decoded data is not a PDF".into());
    }

    if let Some(parent) = path_buf.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("create PDF folder: {e}"))?;
        }
    }
    fs::write(&path_buf, &bytes).map_err(|e| format!("write PDF: {e}"))?;
    Ok(path_buf.to_string_lossy().into_owned())
}
