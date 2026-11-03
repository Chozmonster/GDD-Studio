//! Persist launcher vs editor window size/position/maximized/fullscreen.
//!
//! Launcher and editor share the `main` webview; the frontend switches a
//! "window role" so each mode restores its own last geometry.

use crate::store::{self, WindowGeometry, WindowGeometryFile};
use std::sync::Mutex;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewWindow, WindowEvent,
};

pub const ROLE_LAUNCHER: &str = "launcher";
pub const ROLE_EDITOR: &str = "editor";

pub struct WindowGeomState {
    pub active_role: Mutex<String>,
    /// Skip persist while applying a stored geometry (resize events fire).
    pub suppress_persist: Mutex<bool>,
}

impl Default for WindowGeomState {
    fn default() -> Self {
        Self {
            active_role: Mutex::new(ROLE_LAUNCHER.to_string()),
            suppress_persist: Mutex::new(false),
        }
    }
}

fn normalize_role(role: &str) -> Result<&'static str, String> {
    match role {
        ROLE_LAUNCHER => Ok(ROLE_LAUNCHER),
        ROLE_EDITOR => Ok(ROLE_EDITOR),
        other => Err(format!("Unknown window role: {other}")),
    }
}

fn get_for_role<'a>(file: &'a WindowGeometryFile, role: &str) -> Option<&'a WindowGeometry> {
    match role {
        ROLE_EDITOR => file.editor.as_ref(),
        _ => file.launcher.as_ref(),
    }
}

fn set_for_role(file: &mut WindowGeometryFile, role: &str, geo: WindowGeometry) {
    match role {
        ROLE_EDITOR => file.editor = Some(geo),
        _ => file.launcher = Some(geo),
    }
}

fn capture_geometry(win: &WebviewWindow) -> Result<WindowGeometry, String> {
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let size = win.outer_size().map_err(|e| e.to_string())?;
    let maximized = win.is_maximized().unwrap_or(false);
    let fullscreen = win.is_fullscreen().unwrap_or(false);

    let logical_pos = pos.to_logical::<f64>(scale);
    let logical_size = size.to_logical::<f64>(scale);

    Ok(WindowGeometry {
        x: logical_pos.x,
        y: logical_pos.y,
        width: logical_size.width.max(320.0),
        height: logical_size.height.max(240.0),
        maximized,
        fullscreen,
    })
}

fn merge_normal_bounds(
    previous: Option<&WindowGeometry>,
    mut captured: WindowGeometry,
) -> WindowGeometry {
    if (captured.maximized || captured.fullscreen) && previous.is_some() {
        let prev = previous.unwrap();
        captured.x = prev.x;
        captured.y = prev.y;
        captured.width = prev.width;
        captured.height = prev.height;
    }
    captured
}

pub fn save_role_geometry(app: &AppHandle, role: &str) -> Result<(), String> {
    let role = normalize_role(role)?;
    let Some(win) = app.get_webview_window("main") else {
        return Ok(());
    };
    let captured = capture_geometry(&win)?;
    let mut file = store::load_window_geometry(app)?;
    let previous = get_for_role(&file, role).cloned();
    let geo = merge_normal_bounds(previous.as_ref(), captured);
    set_for_role(&mut file, role, geo);
    store::save_window_geometry(app, &file)
}

pub fn apply_role_geometry(app: &AppHandle, role: &str) -> Result<(), String> {
    let role = normalize_role(role)?;
    let Some(win) = app.get_webview_window("main") else {
        return Ok(());
    };
    let file = store::load_window_geometry(app)?;
    let Some(geo) = get_for_role(&file, role).cloned() else {
        return Ok(());
    };

    if let Some(state) = app.try_state::<WindowGeomState>() {
        if let Ok(mut flag) = state.suppress_persist.lock() {
            *flag = true;
        }
    }
    let result = apply_geometry(&win, &geo);
    if let Some(state) = app.try_state::<WindowGeomState>() {
        if let Ok(mut flag) = state.suppress_persist.lock() {
            *flag = false;
        }
    }
    result
}

fn apply_geometry(win: &WebviewWindow, geo: &WindowGeometry) -> Result<(), String> {
    let _ = win.set_fullscreen(false);
    if win.is_maximized().unwrap_or(false) {
        let _ = win.unmaximize();
    }

    win.set_size(LogicalSize::new(geo.width, geo.height))
        .map_err(|e| format!("set size: {e}"))?;
    win.set_position(LogicalPosition::new(geo.x, geo.y))
        .map_err(|e| format!("set position: {e}"))?;

    if geo.fullscreen {
        win.set_fullscreen(true)
            .map_err(|e| format!("set fullscreen: {e}"))?;
    } else if geo.maximized {
        win.maximize().map_err(|e| format!("maximize: {e}"))?;
    }
    Ok(())
}

/// Switch active role: save current role geometry, apply the next role's.
#[tauri::command]
pub fn set_window_role(
    app: AppHandle,
    state: State<'_, WindowGeomState>,
    role: String,
) -> Result<(), String> {
    let next = normalize_role(&role)?.to_string();
    let previous = {
        let mut guard = state
            .active_role
            .lock()
            .map_err(|_| "window role lock poisoned".to_string())?;
        let prev = guard.clone();
        *guard = next.clone();
        prev
    };

    if previous != next {
        let _ = save_role_geometry(&app, &previous);
        apply_role_geometry(&app, &next)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_window_geometry(
    app: AppHandle,
    role: String,
) -> Result<Option<WindowGeometry>, String> {
    let role = normalize_role(&role)?;
    let file = store::load_window_geometry(&app)?;
    Ok(get_for_role(&file, role).cloned())
}

/// Persist whatever role is currently active (resize/move/close).
pub fn persist_active(app: &AppHandle, state: &WindowGeomState) {
    if state
        .suppress_persist
        .lock()
        .map(|g| *g)
        .unwrap_or(false)
    {
        return;
    }
    let role = state
        .active_role
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| ROLE_LAUNCHER.to_string());
    let _ = save_role_geometry(app, &role);
}

pub fn handle_main_window_event(app: &AppHandle, label: &str, event: &WindowEvent) {
    if label != "main" {
        return;
    }
    match event {
        WindowEvent::Resized(_)
        | WindowEvent::Moved(_)
        | WindowEvent::ScaleFactorChanged { .. }
        | WindowEvent::CloseRequested { .. }
        | WindowEvent::Destroyed => {
            if let Some(state) = app.try_state::<WindowGeomState>() {
                persist_active(app, &*state);
            }
        }
        _ => {}
    }
}

pub fn apply_startup_geometry(app: &AppHandle) {
    let _ = apply_role_geometry(app, ROLE_LAUNCHER);
}
