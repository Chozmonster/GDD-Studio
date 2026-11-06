//! Persist launcher vs editor window size/position/maximized/fullscreen,
//! plus the separate Options webview geometry.
//!
//! Launcher and editor share the `main` webview; the frontend switches a
//! "window role" so each mode restores its own last geometry. Options uses
//! its own window label (`options`) and a dedicated slot in
//! `window-geometry.json`.

use crate::commands::ActiveSession;
use crate::store::{self, WindowGeometry, WindowGeometryFile};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewWindow, WindowEvent,
};

const OPTIONS_LABEL: &str = "options";
const OPTIONS_DEFAULT_WIDTH: f64 = 520.0;
const OPTIONS_DEFAULT_HEIGHT: f64 = 420.0;
const OPTIONS_MIN_WIDTH: f64 = 400.0;
const OPTIONS_MIN_HEIGHT: f64 = 300.0;

pub const ROLE_LAUNCHER: &str = "launcher";
pub const ROLE_EDITOR: &str = "editor";

/// How long to ignore resize/move persist after applying stored geometry.
/// Platform window events for size/fullscreen often arrive on a later tick;
/// clearing suppress immediately can overwrite a role's fullscreen flag with
/// an intermediate windowed capture.
const APPLY_SETTLE_MS: u64 = 350;

pub struct WindowGeomState {
    pub active_role: Mutex<String>,
    /// Skip persist while applying a stored geometry (resize events fire).
    pub suppress_persist: Mutex<bool>,
    /// Bumped on each apply so a stale settle timer cannot clear a newer one.
    pub apply_generation: Mutex<u64>,
}

impl Default for WindowGeomState {
    fn default() -> Self {
        Self {
            active_role: Mutex::new(ROLE_LAUNCHER.to_string()),
            suppress_persist: Mutex::new(false),
            apply_generation: Mutex::new(0),
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

fn set_suppress(app: &AppHandle, value: bool) {
    if let Some(state) = app.try_state::<WindowGeomState>() {
        if let Ok(mut flag) = state.suppress_persist.lock() {
            *flag = value;
        }
    }
}

fn bump_apply_generation(app: &AppHandle) -> u64 {
    if let Some(state) = app.try_state::<WindowGeomState>() {
        if let Ok(mut gen) = state.apply_generation.lock() {
            *gen = gen.wrapping_add(1);
            return *gen;
        }
    }
    0
}

fn schedule_settle(app: &AppHandle, generation: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(APPLY_SETTLE_MS));
        let Some(state) = app.try_state::<WindowGeomState>() else {
            return;
        };
        let current = state
            .apply_generation
            .lock()
            .map(|g| *g)
            .unwrap_or(0);
        if current != generation {
            return;
        }
        if let Ok(mut flag) = state.suppress_persist.lock() {
            *flag = false;
        }
        // Capture the settled window once so disk matches final fullscreen/max.
        persist_active(&app, &*state);
    });
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

    let generation = bump_apply_generation(app);
    set_suppress(app, true);
    let result = apply_geometry(&win, &geo);
    if result.is_err() {
        set_suppress(app, false);
        return result;
    }
    // Keep the intended role geometry on disk while the window settles so a
    // late intermediate resize cannot drop fullscreen/maximized.
    let mut file = store::load_window_geometry(app)?;
    set_for_role(&mut file, role, geo);
    let _ = store::save_window_geometry(app, &file);
    schedule_settle(app, generation);
    Ok(())
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
    session: State<'_, ActiveSession>,
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

    // Leaving the editor clears the active project so Options cannot reveal a
    // folder the user is no longer working in.
    if next == ROLE_LAUNCHER {
        if let Ok(mut guard) = session.active_project_id.lock() {
            *guard = None;
        }
    }

    if previous != next {
        // If the previous role is still settling from an apply, disk already
        // holds its intended geometry — capturing now can drop fullscreen.
        let settling = state
            .suppress_persist
            .lock()
            .map(|g| *g)
            .unwrap_or(false);
        if !settling {
            let _ = save_role_geometry(&app, &previous);
        }
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

fn save_options_geometry(app: &AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window(OPTIONS_LABEL) else {
        return Ok(());
    };
    let captured = capture_geometry(&win)?;
    let mut file = store::load_window_geometry(app)?;
    let previous = file.options.clone();
    file.options = Some(merge_normal_bounds(previous.as_ref(), captured));
    store::save_window_geometry(app, &file)
}

/// Create the Options webview, restoring last size/position when present.
pub fn open_options_window_with_geometry(app: &AppHandle) -> Result<(), String> {
    let url = tauri::WebviewUrl::App("index.html?window=options".into());
    let stored = store::load_window_geometry(app)
        .ok()
        .and_then(|f| f.options);

    let mut builder = tauri::WebviewWindowBuilder::new(app, OPTIONS_LABEL, url)
        .title("Options — GDD Studio")
        .inner_size(OPTIONS_DEFAULT_WIDTH, OPTIONS_DEFAULT_HEIGHT)
        .min_inner_size(OPTIONS_MIN_WIDTH, OPTIONS_MIN_HEIGHT)
        .resizable(true);

    if stored.is_none() {
        builder = builder.center();
    }

    let win = builder
        .build()
        .map_err(|e| format!("open options window: {e}"))?;

    if let Some(mut geo) = stored {
        geo.width = geo.width.max(OPTIONS_MIN_WIDTH);
        geo.height = geo.height.max(OPTIONS_MIN_HEIGHT);
        apply_geometry(&win, &geo)?;
    }
    Ok(())
}

pub fn handle_main_window_event(app: &AppHandle, label: &str, event: &WindowEvent) {
    match label {
        "main" => match event {
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
        },
        OPTIONS_LABEL => match event {
            WindowEvent::Resized(_)
            | WindowEvent::Moved(_)
            | WindowEvent::ScaleFactorChanged { .. }
            | WindowEvent::CloseRequested { .. }
            | WindowEvent::Destroyed => {
                let _ = save_options_geometry(app);
            }
            _ => {}
        },
        _ => {}
    }
}

pub fn apply_startup_geometry(app: &AppHandle) {
    let _ = apply_role_geometry(app, ROLE_LAUNCHER);
}
