//! Tauri IPC for launcher (projects, settings, updates).

use crate::store::{self, AppSettings, FlowchartSummary, ProjectRecord};
use crate::updates::{self, UpdateStatus};
use serde::Serialize;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    pub ok: bool,
    pub app: String,
    pub version: String,
}

#[tauri::command]
pub fn app_health() -> HealthStatus {
    HealthStatus {
        ok: true,
        app: "GDD Studio".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<ProjectRecord>, String> {
    store::load_projects(&app)
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    name: String,
    parent_dir: String,
) -> Result<ProjectRecord, String> {
    store::create_project(&app, name, parent_dir)
}

#[tauri::command]
pub fn delete_project(app: AppHandle, project_id: String) -> Result<(), String> {
    store::delete_project(&app, project_id)
}

#[tauri::command]
pub fn open_project(app: AppHandle, project_id: String) -> Result<ProjectRecord, String> {
    store::open_project_record(&app, project_id)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    store::load_settings(&app)
}

#[tauri::command]
pub fn set_automatic_updates(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = store::load_settings(&app)?;
    settings.automatic_updates = enabled;
    store::save_settings(&app, &settings)?;
    Ok(settings)
}

/// Check for updates. Persists last-check timestamp.
/// When `force` is false and a check already ran today, returns cached "skipped" status
/// unless there is a simulated pending update flag.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<UpdateStatus, String> {
    updates::check_for_updates(app, force).await
}

/// Download + install when an update is available (or simulated).
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<UpdateStatus, String> {
    updates::install_update(app).await
}

#[tauri::command]
pub fn get_patch_notes(app: AppHandle) -> Result<String, String> {
    updates::get_cached_patch_notes(&app)
}

/// Open (or focus) the Options window.
#[tauri::command]
pub async fn open_options_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("options") {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("index.html?window=options".into());
    tauri::WebviewWindowBuilder::new(&app, "options", url)
        .title("Options — GDD Studio")
        .inner_size(480.0, 360.0)
        .resizable(false)
        .center()
        .build()
        .map_err(|e| format!("open options window: {e}"))?;
    Ok(())
}

/// Default parent folder suggestion for New Project (documents dir).
#[tauri::command]
pub fn default_projects_dir(app: AppHandle) -> Result<String, String> {
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("resolve documents dir: {e}"))?;
    let dir = docs.join("GDD Studio Projects");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create projects dir: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_flowcharts(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<FlowchartSummary>, String> {
    store::list_flowcharts(&app, project_id)
}

#[tauri::command]
pub fn load_flowchart(
    app: AppHandle,
    project_id: String,
    flowchart_id: String,
) -> Result<serde_json::Value, String> {
    store::load_flowchart(&app, project_id, flowchart_id)
}

#[tauri::command]
pub fn save_flowchart(
    app: AppHandle,
    project_id: String,
    flowchart_id: String,
    document: serde_json::Value,
) -> Result<(), String> {
    store::save_flowchart(&app, project_id, flowchart_id, document)
}

#[tauri::command]
pub fn flowchart_exists(
    app: AppHandle,
    project_id: String,
    flowchart_id: String,
) -> Result<bool, String> {
    store::flowchart_exists(&app, project_id, flowchart_id)
}

#[tauri::command]
pub fn delete_flowchart(
    app: AppHandle,
    project_id: String,
    flowchart_id: String,
) -> Result<(), String> {
    store::delete_flowchart(&app, project_id, flowchart_id)
}

#[tauri::command]
pub fn load_document(app: AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    store::load_document(&app, project_id)
}

#[tauri::command]
pub fn save_document(
    app: AppHandle,
    project_id: String,
    document: serde_json::Value,
) -> Result<(), String> {
    store::save_document(&app, project_id, document)
}
