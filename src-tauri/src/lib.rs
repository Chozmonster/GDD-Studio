//! GDD Studio — Tauri application entry and IPC command stubs.
//!
//! Extension points (v1 / later — not implemented in this scaffold):
//! - Local project store (SQLite + blob dir)
//! - Document CRUD, templates, variables, wiki-link index
//! - Asset pipeline, spellcheck hooks, PDF export
//! - Sync / share (v1.5+)

mod commands;

use commands::{app_health, list_projects, open_project};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_health,
            list_projects,
            open_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running GDD Studio");
}
