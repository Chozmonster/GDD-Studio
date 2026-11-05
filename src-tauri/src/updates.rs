//! Update check / install against Tauri updater + GitHub Releases.
//!
//! Real updates require:
//! - GitHub Releases for `Chozmonster/GDD-Studio` with updater artifacts
//!   (`latest.json` + signed bundles) — typically via `tauri-apps/tauri-action`
//! - Matching minisign private key in CI (`TAURI_SIGNING_PRIVATE_KEY`)
//!
//! When no endpoint/release/signing is available, checks fail soft and the UI
//! stays demoable. Set env `GDD_STUDIO_SIMULATE_UPDATE=1` to force an
//! "update available" state for launcher UX testing.

use crate::store::{self, now_secs};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

const DAY_SECS: u64 = 24 * 60 * 60;
const CACHE_FILE: &str = "update-cache.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// none | available | upToDate | skipped | error | installing | installed | simulated
    pub state: String,
    pub current_version: String,
    pub available_version: Option<String>,
    pub notes: Option<String>,
    pub message: String,
    pub checked_at: u64,
    pub automatic_updates: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UpdateCache {
    available_version: Option<String>,
    notes: Option<String>,
    last_status: Option<String>,
}

fn simulate_enabled() -> bool {
    matches!(
        std::env::var("GDD_STUDIO_SIMULATE_UPDATE").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE") | Ok("yes")
    )
}

fn cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(CACHE_FILE))
}

fn load_disk_cache(app: &AppHandle) -> UpdateCache {
    let Ok(path) = cache_path(app) else {
        return UpdateCache::default();
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return UpdateCache::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_disk_cache(app: &AppHandle, cache: &UpdateCache) {
    if let Ok(path) = cache_path(app) {
        if let Ok(raw) = serde_json::to_string_pretty(cache) {
            let _ = std::fs::write(path, raw);
        }
    }
}

fn checked_today(last: Option<u64>, now: u64) -> bool {
    match last {
        Some(ts) => now.saturating_sub(ts) < DAY_SECS,
        None => false,
    }
}

fn base_status(app: &AppHandle, state: &str, message: impl Into<String>) -> Result<UpdateStatus, String> {
    let settings = store::load_settings(app)?;
    Ok(UpdateStatus {
        state: state.into(),
        current_version: env!("CARGO_PKG_VERSION").into(),
        available_version: None,
        notes: None,
        message: message.into(),
        checked_at: settings.last_update_check_at.unwrap_or(0),
        automatic_updates: settings.automatic_updates,
    })
}

pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<UpdateStatus, String> {
    let mut settings = store::load_settings(&app)?;
    let now = now_secs();

    if !force && checked_today(settings.last_update_check_at, now) {
        let cache = load_disk_cache(&app);
        if cache.available_version.is_some() || simulate_enabled() {
            let version = cache
                .available_version
                .clone()
                .unwrap_or_else(|| format!("{}.1-sim", env!("CARGO_PKG_VERSION")));
            let notes = cache.notes.clone().or_else(|| {
                if simulate_enabled() {
                    Some(simulated_notes(&version))
                } else {
                    None
                }
            });
            return Ok(UpdateStatus {
                state: if simulate_enabled() && cache.available_version.is_none() {
                    "simulated".into()
                } else {
                    "available".into()
                },
                current_version: env!("CARGO_PKG_VERSION").into(),
                available_version: Some(version),
                notes,
                message: "Using today's update check result.".into(),
                checked_at: settings.last_update_check_at.unwrap_or(now),
                automatic_updates: settings.automatic_updates,
            });
        }
        return Ok(UpdateStatus {
            state: "skipped".into(),
            current_version: env!("CARGO_PKG_VERSION").into(),
            available_version: None,
            notes: None,
            message: "Already checked for updates today.".into(),
            checked_at: settings.last_update_check_at.unwrap_or(now),
            automatic_updates: settings.automatic_updates,
        });
    }

    settings.last_update_check_at = Some(now);
    store::save_settings(&app, &settings)?;

    if simulate_enabled() {
        let version = format!("{}.1-sim", env!("CARGO_PKG_VERSION"));
        let notes = simulated_notes(&version);
        let cache = UpdateCache {
            available_version: Some(version.clone()),
            notes: Some(notes.clone()),
            last_status: Some("simulated".into()),
        };
        save_disk_cache(&app, &cache);
        let mut status = UpdateStatus {
            state: "simulated".into(),
            current_version: env!("CARGO_PKG_VERSION").into(),
            available_version: Some(version),
            notes: Some(notes),
            message: "Simulated update (GDD_STUDIO_SIMULATE_UPDATE). No download performed."
                .into(),
            checked_at: now,
            automatic_updates: settings.automatic_updates,
        };
        if settings.automatic_updates {
            status.message.push_str(" Auto-updates on — would install if a real release existed.");
        }
        return Ok(status);
    }

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let notes = update.body.clone();
                let version = update.version.clone();
                let cache = UpdateCache {
                    available_version: Some(version.clone()),
                    notes: notes.clone(),
                    last_status: Some("available".into()),
                };
                save_disk_cache(&app, &cache);

                if settings.automatic_updates {
                    update
                        .download_and_install(|_, _| {}, || {})
                        .await
                        .map_err(|e| format!("auto-install failed: {e}"))?;
                    return Ok(UpdateStatus {
                        state: "installed".into(),
                        current_version: env!("CARGO_PKG_VERSION").into(),
                        available_version: Some(version),
                        notes,
                        message: "Update downloaded and installed. Restart to finish.".into(),
                        checked_at: now,
                        automatic_updates: true,
                    });
                }

                Ok(UpdateStatus {
                    state: "available".into(),
                    current_version: env!("CARGO_PKG_VERSION").into(),
                    available_version: Some(version),
                    notes,
                    message: "An update is available.".into(),
                    checked_at: now,
                    automatic_updates: false,
                })
            }
            Ok(None) => {
                save_disk_cache(
                    &app,
                    &UpdateCache {
                        available_version: None,
                        notes: None,
                        last_status: Some("upToDate".into()),
                    },
                );
                base_status(&app, "upToDate", "You're on the latest version.").map(|mut s| {
                    s.checked_at = now;
                    s
                })
            }
            Err(e) => {
                // Soft-fail: no release / signing / network — UI still works.
                base_status(
                    &app,
                    "error",
                    format!(
                        "Update check unavailable ({e}). Publish signed GitHub Releases to enable updates."
                    ),
                )
                .map(|mut s| {
                    s.checked_at = now;
                    s
                })
            }
        },
        Err(e) => base_status(
            &app,
            "error",
            format!("Updater not configured ({e}). See README — GitHub Releases + signing key."),
        )
        .map(|mut s| {
            s.checked_at = now;
            s
        }),
    }
}

pub async fn install_update(app: AppHandle) -> Result<UpdateStatus, String> {
    let settings = store::load_settings(&app)?;
    let now = now_secs();

    if simulate_enabled() {
        return Ok(UpdateStatus {
            state: "simulated".into(),
            current_version: env!("CARGO_PKG_VERSION").into(),
            available_version: Some(format!("{}.1-sim", env!("CARGO_PKG_VERSION"))),
            notes: Some(simulated_notes(&format!("{}.1-sim", env!("CARGO_PKG_VERSION")))),
            message: "Simulated install — no package was applied. Disable GDD_STUDIO_SIMULATE_UPDATE for real updater flow.".into(),
            checked_at: now,
            automatic_updates: settings.automatic_updates,
        });
    }

    let updater = app.updater().map_err(|e| format!("updater: {e}"))?;
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let notes = update.body.clone();
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|e| format!("install failed: {e}"))?;
            Ok(UpdateStatus {
                state: "installed".into(),
                current_version: env!("CARGO_PKG_VERSION").into(),
                available_version: Some(version),
                notes,
                message: "Update installed. Restart the app to run the new version.".into(),
                checked_at: now,
                automatic_updates: settings.automatic_updates,
            })
        }
        Ok(None) => base_status(&app, "upToDate", "No update to install."),
        Err(e) => Err(format!("Update install failed: {e}")),
    }
}

pub fn get_cached_patch_notes(app: &AppHandle) -> Result<String, String> {
    let cache = load_disk_cache(app);
    if let Some(notes) = cache.notes.filter(|n| !n.trim().is_empty()) {
        return Ok(notes);
    }
    if simulate_enabled() {
        let version = cache
            .available_version
            .unwrap_or_else(|| format!("{}.1-sim", env!("CARGO_PKG_VERSION")));
        return Ok(simulated_notes(&version));
    }
    Ok("No patch notes cached yet. Run an update check first, or publish a GitHub Release with a body.".into())
}

fn simulated_notes(version: &str) -> String {
    format!(
        "## GDD Studio {version}\n\n\
         - Godot-style project launcher\n\
         - Options window with automatic updates toggle\n\
         - TipTap editor shell\n\n\
         _This is simulated release notes (GDD_STUDIO_SIMULATE_UPDATE)._"
    )
}
