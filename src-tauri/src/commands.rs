//! Stubbed Tauri commands. Replace bodies as the local-first core lands.
//! Do not add sync/auth commands here until v1.5.

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    pub ok: bool,
    pub app: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    /// Reserved for a filesystem or content-addressed path once persistence exists.
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectResult {
    pub project: ProjectSummary,
    pub message: String,
}

/// Lightweight readiness probe for the UI / future diagnostics.
#[tauri::command]
pub fn app_health() -> HealthStatus {
    HealthStatus {
        ok: true,
        app: "GDD Studio".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

/// Returns placeholder projects until the local project library is implemented.
/// TODO(v1): read from the local project store.
#[tauri::command]
pub fn list_projects() -> Vec<ProjectSummary> {
    vec![
        ProjectSummary {
            id: "placeholder-demo".into(),
            name: "Demo Project (placeholder)".into(),
            path: None,
        },
        ProjectSummary {
            id: "placeholder-empty".into(),
            name: "Empty GDD (placeholder)".into(),
            path: None,
        },
    ]
}

/// Stub for opening a project by id.
/// TODO(v1): load project metadata + documents from disk/SQLite.
#[tauri::command]
pub fn open_project(project_id: String) -> Result<OpenProjectResult, String> {
    let projects = list_projects();
    let project = projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Unknown project id: {project_id}"))?;

    Ok(OpenProjectResult {
        project,
        message: "Project open is stubbed — persistence lands in v1.".into(),
    })
}
