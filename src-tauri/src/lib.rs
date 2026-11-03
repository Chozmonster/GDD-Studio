//! GDD Studio — Tauri entry.
//!
//! Launcher + local project library + settings + updater + flowcharts +
//! documentation variables. Still deferred: wiki links, assets, spellcheck,
//! PDF, sync/share.

mod commands;
mod store;
mod updates;

use commands::{
    app_health, check_for_updates, create_project, default_projects_dir, delete_flowchart,
    delete_project, flowchart_exists, get_patch_notes, get_settings, install_update,
    list_flowcharts, list_projects, load_document, load_flowchart, load_variables,
    open_options_window, open_project, save_document, save_flowchart, save_variables,
    set_automatic_updates, set_display_variable_names,
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
            set_display_variable_names,
            check_for_updates,
            install_update,
            get_patch_notes,
            open_options_window,
            default_projects_dir,
            list_flowcharts,
            load_flowchart,
            save_flowchart,
            flowchart_exists,
            delete_flowchart,
            load_document,
            save_document,
            load_variables,
            save_variables,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GDD Studio");
}
