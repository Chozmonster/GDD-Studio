//! Local persistence for project library metadata and app settings.
//! JSON files under the app data directory — good enough for launcher v1;
//! document bodies / SQLite land later.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const LIBRARY_FILE: &str = "project-library.json";
const SETTINGS_FILE: &str = "settings.json";
const PROJECT_MARKER: &str = "gdd-studio.json";

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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            automatic_updates: true,
            last_update_check_at: None,
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

/// Seed a couple of demo entries in browser-less first run only if library empty — disabled;
/// launcher starts empty like Godot.
#[allow(dead_code)]
pub fn ensure_empty_ok() {}
