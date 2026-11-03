//! GDD Studio — Tauri entry.
//!
//! Launcher + local project library + settings + updater hooks.
//! Still deferred: variables, wiki links, assets, spellcheck, PDF, sync/share.

mod commands;
mod store;
mod updates;

use commands::{
    app_health, check_for_updates, create_project, default_projects_dir, delete_project,
    get_patch_notes, get_settings, install_update, list_projects, open_options_window,
    open_project, set_automatic_updates,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_health,
            list_projects,
            create_project,
            delete_project,
            open_project,
            get_settings,
            set_automatic_updates,
            check_for_updates,
            install_update,
            get_patch_notes,
            open_options_window,
            default_projects_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GDD Studio");
}
