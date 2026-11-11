//! GDD Studio — Tauri entry.
//!
//! Launcher + local project library + settings + updater + flowcharts +
//! RGD sheets + mood boards + charts + whiteboards + documentation variables +
//! multi-doc projects / wiki links + media assets + templates + PDF export.
//! Spellcheck runs in the webview (nspell).

mod commands;
mod store;
mod updates;
mod window_geom;

use commands::{
    app_health, chart_exists, check_for_updates, create_project, create_project_document,
    default_projects_dir, delete_asset, delete_chart, delete_flowchart, delete_mood_board,
    delete_project, delete_project_document, delete_rgd_sheet, delete_template, delete_whiteboard,
    ensure_project_exports_dir, export_project_archive, flowchart_exists, get_active_project,
    get_asset_data_url, get_asset_path, get_patch_notes, get_settings, install_update, list_assets,
    list_backlinks, list_charts, list_documents, list_flowcharts, list_mood_boards, list_projects,
    list_rgd_sheets, list_templates, list_whiteboards, load_chart, load_document, load_flowchart,
    load_mood_board, load_project_document, load_rgd_sheet, load_template, load_variables,
    load_whiteboard, mood_board_exists, open_options_window, open_project, resolve_wiki_slug,
    reveal_project_folder, rgd_sheet_exists, save_asset, save_chart, save_document, save_flowchart,
    save_mood_board, save_project_document, save_rgd_sheet, save_template, save_variables,
    save_whiteboard, set_automatic_updates, set_display_variable_names, set_paper_size,
    suggest_project_archive_path, whiteboard_exists, write_export_pdf, ActiveSession,
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
            suggest_project_archive_path,
            export_project_archive,
            get_settings,
            set_automatic_updates,
            set_display_variable_names,
            set_paper_size,
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
            list_mood_boards,
            load_mood_board,
            save_mood_board,
            mood_board_exists,
            delete_mood_board,
            list_charts,
            load_chart,
            save_chart,
            chart_exists,
            delete_chart,
            list_whiteboards,
            load_whiteboard,
            save_whiteboard,
            whiteboard_exists,
            delete_whiteboard,
            list_templates,
            save_template,
            load_template,
            delete_template,
            ensure_project_exports_dir,
            write_export_pdf,
            set_window_role,
            get_window_geometry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GDD Studio");
}
