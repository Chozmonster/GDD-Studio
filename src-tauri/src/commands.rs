//! Tauri IPC command surface (launcher, projects, docs, tools, updater).
//!
//! Thin wrappers over `store` / `updates` — keep validation and path policy in
//! those modules so the webview never invents filesystem paths itself.

use crate::store::{
    self, AppSettings, AssetRecord, DocSummary, FlowchartSummary, ProjectDocument, ProjectRecord,
    RgdSheetSummary, TemplateRecord,
};
use crate::updates::{self, UpdateStatus};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

/// Tracks which project the editor currently has open (Options is a separate window).
pub struct ActiveSession {
    pub active_project_id: Mutex<Option<String>>,
}

impl Default for ActiveSession {
    fn default() -> Self {
        Self {
            active_project_id: Mutex::new(None),
        }
    }
}

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
pub fn open_project(
    app: AppHandle,
    session: State<'_, ActiveSession>,
    project_id: String,
) -> Result<ProjectRecord, String> {
    let record = store::open_project_record(&app, project_id)?;
    let mut guard = session
        .active_project_id
        .lock()
        .map_err(|_| "session lock poisoned".to_string())?;
    *guard = Some(record.id.clone());
    Ok(record)
}

/// Project currently open in the editor, if any (None on the launcher).
#[tauri::command]
pub fn get_active_project(
    app: AppHandle,
    session: State<'_, ActiveSession>,
) -> Result<Option<ProjectRecord>, String> {
    let id = session
        .active_project_id
        .lock()
        .map_err(|_| "session lock poisoned".to_string())?
        .clone();
    match id {
        Some(id) => Ok(Some(store::project_by_id(&app, &id)?)),
        None => Ok(None),
    }
}

/// Reveal a project's root folder in the OS file manager (Explorer / Finder / xdg).
/// When `project_id` is omitted, uses the editor's active project.
#[tauri::command]
pub fn reveal_project_folder(
    app: AppHandle,
    session: State<'_, ActiveSession>,
    project_id: Option<String>,
) -> Result<(), String> {
    let id = match project_id {
        Some(id) => id,
        None => session
            .active_project_id
            .lock()
            .map_err(|_| "session lock poisoned".to_string())?
            .clone()
            .ok_or_else(|| "Open a project first.".to_string())?,
    };
    let project = store::project_by_id(&app, &id)?;
    let path = PathBuf::from(&project.path);
    if !path.is_dir() {
        return Err(format!("Project folder not found:\n{}", project.path));
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| format!("Open project folder failed: {e}"))
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

#[tauri::command]
pub fn set_display_variable_names(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = store::load_settings(&app)?;
    settings.display_variable_names = enabled;
    store::save_settings(&app, &settings)?;
    Ok(settings)
}

/// Check for updates. Persists last-check timestamp.
/// When `force` is false and a check already ran today, returns cached status.
/// Pass `auto_install: true` only for the daily/background path; Options Check
/// must pass `false` so a manual query never downloads.
#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    force: bool,
    auto_install: bool,
) -> Result<UpdateStatus, String> {
    updates::check_for_updates(app, force, auto_install).await
}

/// Download + install when an update is available (or simulated).
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<UpdateStatus, String> {
    updates::install_update(app).await
}

#[tauri::command]
pub async fn get_patch_notes(app: AppHandle) -> Result<String, String> {
    updates::get_cached_patch_notes(&app).await
}

/// Open (or focus) the Options window.
#[tauri::command]
pub async fn open_options_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("options") {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    crate::window_geom::open_options_window_with_geometry(&app)
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
pub fn list_rgd_sheets(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<RgdSheetSummary>, String> {
    store::list_rgd_sheets(&app, project_id)
}

#[tauri::command]
pub fn load_rgd_sheet(
    app: AppHandle,
    project_id: String,
    sheet_id: String,
) -> Result<serde_json::Value, String> {
    store::load_rgd_sheet(&app, project_id, sheet_id)
}

#[tauri::command]
pub fn save_rgd_sheet(
    app: AppHandle,
    project_id: String,
    sheet_id: String,
    document: serde_json::Value,
) -> Result<(), String> {
    store::save_rgd_sheet(&app, project_id, sheet_id, document)
}

#[tauri::command]
pub fn rgd_sheet_exists(
    app: AppHandle,
    project_id: String,
    sheet_id: String,
) -> Result<bool, String> {
    store::rgd_sheet_exists(&app, project_id, sheet_id)
}

#[tauri::command]
pub fn delete_rgd_sheet(
    app: AppHandle,
    project_id: String,
    sheet_id: String,
) -> Result<(), String> {
    store::delete_rgd_sheet(&app, project_id, sheet_id)
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

#[tauri::command]
pub fn load_variables(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<store::DocVariable>, String> {
    store::load_variables(&app, project_id)
}

#[tauri::command]
pub fn save_variables(
    app: AppHandle,
    project_id: String,
    variables: Vec<store::DocVariable>,
) -> Result<(), String> {
    store::save_variables(&app, project_id, variables)
}

#[tauri::command]
pub fn list_documents(app: AppHandle, project_id: String) -> Result<Vec<DocSummary>, String> {
    store::list_documents(&app, project_id)
}

#[tauri::command]
pub fn load_project_document(
    app: AppHandle,
    project_id: String,
    doc_id: String,
) -> Result<ProjectDocument, String> {
    store::load_project_document(&app, project_id, doc_id)
}

#[tauri::command]
pub fn save_project_document(
    app: AppHandle,
    project_id: String,
    document: ProjectDocument,
) -> Result<ProjectDocument, String> {
    store::save_project_document(&app, project_id, document)
}

#[tauri::command]
pub fn create_project_document(
    app: AppHandle,
    project_id: String,
    title: String,
) -> Result<ProjectDocument, String> {
    store::create_project_document(&app, project_id, title)
}

#[tauri::command]
pub fn delete_project_document(
    app: AppHandle,
    project_id: String,
    doc_id: String,
) -> Result<(), String> {
    store::delete_project_document(&app, project_id, doc_id)
}

#[tauri::command]
pub fn resolve_wiki_slug(
    app: AppHandle,
    project_id: String,
    slug_or_title: String,
) -> Result<Option<DocSummary>, String> {
    store::resolve_wiki_slug(&app, project_id, slug_or_title)
}

#[tauri::command]
pub fn list_backlinks(
    app: AppHandle,
    project_id: String,
    target_doc_id: String,
) -> Result<Vec<DocSummary>, String> {
    store::list_backlinks(&app, project_id, target_doc_id)
}

#[tauri::command]
pub fn list_assets(app: AppHandle, project_id: String) -> Result<Vec<AssetRecord>, String> {
    store::list_assets(&app, project_id)
}

#[tauri::command]
pub fn save_asset(
    app: AppHandle,
    project_id: String,
    filename: String,
    mime: String,
    data_base64: String,
) -> Result<AssetRecord, String> {
    store::save_asset(&app, project_id, filename, mime, data_base64)
}

#[tauri::command]
pub fn get_asset_path(
    app: AppHandle,
    project_id: String,
    asset_id: String,
) -> Result<String, String> {
    store::get_asset_path(&app, project_id, asset_id)
}

#[tauri::command]
pub fn get_asset_data_url(
    app: AppHandle,
    project_id: String,
    asset_id: String,
) -> Result<String, String> {
    store::get_asset_data_url(&app, project_id, asset_id)
}

#[tauri::command]
pub fn delete_asset(app: AppHandle, project_id: String, asset_id: String) -> Result<(), String> {
    store::delete_asset(&app, project_id, asset_id)
}

#[tauri::command]
pub fn list_mood_boards(
    app: AppHandle,
    project_id: String,
) -> Result<Vec<store::MoodBoardSummary>, String> {
    store::list_mood_boards(&app, project_id)
}

#[tauri::command]
pub fn load_mood_board(
    app: AppHandle,
    project_id: String,
    board_id: String,
) -> Result<store::MoodBoardDocument, String> {
    store::load_mood_board(&app, project_id, board_id)
}

#[tauri::command]
pub fn save_mood_board(
    app: AppHandle,
    project_id: String,
    board_id: String,
    document: store::MoodBoardDocument,
) -> Result<store::MoodBoardDocument, String> {
    store::save_mood_board(&app, project_id, board_id, document)
}

#[tauri::command]
pub fn mood_board_exists(
    app: AppHandle,
    project_id: String,
    board_id: String,
) -> Result<bool, String> {
    store::mood_board_exists(&app, project_id, board_id)
}

#[tauri::command]
pub fn delete_mood_board(
    app: AppHandle,
    project_id: String,
    board_id: String,
) -> Result<(), String> {
    store::delete_mood_board(&app, project_id, board_id)
}

#[tauri::command]
pub fn list_templates(
    app: AppHandle,
    project_id: Option<String>,
) -> Result<Vec<TemplateRecord>, String> {
    store::list_templates(&app, project_id)
}

#[tauri::command]
pub fn save_template(
    app: AppHandle,
    name: String,
    body: serde_json::Value,
    scope: String,
    project_id: Option<String>,
    template_id: Option<String>,
) -> Result<TemplateRecord, String> {
    store::save_template(&app, name, body, scope, project_id, template_id)
}

#[tauri::command]
pub fn load_template(
    app: AppHandle,
    template_id: String,
    scope: String,
    project_id: Option<String>,
) -> Result<TemplateRecord, String> {
    store::load_template(&app, template_id, scope, project_id)
}

#[tauri::command]
pub fn delete_template(
    app: AppHandle,
    template_id: String,
    scope: String,
    project_id: Option<String>,
) -> Result<(), String> {
    store::delete_template(&app, template_id, scope, project_id)
}

#[tauri::command]
pub fn write_export_html(app: AppHandle, html: String) -> Result<String, String> {
    store::write_export_html(&app, html)
}
