//! GDD Studio — Tauri entry.
//!
//! Launcher + local project library + settings + updater + flowcharts +
//! RGD sheets + mood board + documentation variables + multi-doc projects /
//! wiki links + media assets + templates + export HTML.
//! Spellcheck runs in the webview (nspell).

mod commands;
mod store;
mod updates;
mod window_geom;

use commands::{
    app_health, check_for_updates, create_project, create_project_document, default_projects_dir,
    delete_asset, delete_flowchart, delete_project, delete_project_document, delete_rgd_sheet,
    delete_template, flowchart_exists, get_active_project, get_asset_data_url, get_asset_path,
    get_patch_notes, get_settings, install_update, list_assets, list_backlinks, list_documents,
    list_flowcharts, list_projects, list_rgd_sheets, list_templates, load_document, load_flowchart,
    load_mood_board, load_project_document, load_rgd_sheet, load_template, load_variables,
    open_options_window, open_project, resolve_wiki_slug, reveal_project_folder, rgd_sheet_exists,
    save_asset, save_document, save_flowchart, save_mood_board, save_project_document,
    save_rgd_sheet, save_template, save_variables, set_automatic_updates,
    set_display_variable_names, write_export_html, ActiveSession,
};
use tauri::Manager;
use window_geom::{get_window_geometry, set_window_role, WindowGeomState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(WindowGeomState::default())
        .manage(ActiveSession::default())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            window_geom::apply_startup_geometry(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            window_geom::handle_main_window_event(window.app_handle(), window.label(), event);
        })
        .invoke_handler(tauri::generate_handler![
            app_health,
            list_projects,
            create_project,
            delete_project,
            open_project,
            get_active_project,
            reveal_project_folder,
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
            list_rgd_sheets,
            load_rgd_sheet,
            save_rgd_sheet,
            rgd_sheet_exists,
            delete_rgd_sheet,
            load_document,
            save_document,
            load_variables,
            save_variables,
            list_documents,
            load_project_document,
            save_project_document,
            create_project_document,
            delete_project_document,
            resolve_wiki_slug,
            list_backlinks,
            list_assets,
            save_asset,
            get_asset_path,
            get_asset_data_url,
            delete_asset,
            load_mood_board,
            save_mood_board,
            list_templates,
            save_template,
            load_template,
            delete_template,
            write_export_html,
            set_window_role,
            get_window_geometry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GDD Studio");
}
