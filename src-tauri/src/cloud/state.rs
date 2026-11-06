//! Non-secret cloud sync state (`cloud-sync.json`) + OS keyring tokens.
//!
//! Tokens never land in settings.json, project folders, or this file.

use crate::store::{self, now_secs};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::AppHandle;

const CLOUD_SYNC_FILE: &str = "cloud-sync.json";
const KEYRING_SERVICE: &str = "gdd-studio-cloud";
const KEYRING_REFRESH: &str = "refresh-token";
const KEYRING_ACCESS: &str = "access-token";
const KEYRING_ACCESS_EXPIRES: &str = "access-expires-at";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncState {
    /// Active provider id (`google-drive`, later `onedrive` / `dropbox`).
    pub provider_id: Option<String>,
    /// Best-effort account label (email) when the provider returns one.
    pub account_label: Option<String>,
    /// Remote id of the visible `GDD Studio` root folder.
    pub root_folder_id: Option<String>,
    pub linked_at: Option<u64>,
    /// Options → auto-sync on close (default off).
    #[serde(default)]
    pub auto_sync_on_close: bool,
    /// local project id → link metadata
    #[serde(default)]
    pub projects: HashMap<String, CloudProjectLink>,
    /// Last user-visible sync / auth error (cleared on success).
    pub last_error: Option<String>,
    pub last_sync_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudProjectLink {
    pub local_path: String,
    pub remote_folder_id: String,
    pub slug: String,
    pub last_sync_at: Option<u64>,
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(store::data_dir(app)?.join(CLOUD_SYNC_FILE))
}

pub fn load_state(app: &AppHandle) -> Result<CloudSyncState, String> {
    let path = state_path(app)?;
    if !path.exists() {
        return Ok(CloudSyncState::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read cloud-sync.json: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(CloudSyncState::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("parse cloud-sync.json: {e}"))
}

pub fn save_state(app: &AppHandle, state: &CloudSyncState) -> Result<(), String> {
    let path = state_path(app)?;
    let raw = serde_json::to_string_pretty(state).map_err(|e| format!("serialize cloud-sync: {e}"))?;
    std::fs::write(&path, raw).map_err(|e| format!("write cloud-sync.json: {e}"))
}

fn keyring_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| format!("keyring entry: {e}"))
}

pub fn store_tokens(
    refresh_token: Option<&str>,
    access_token: Option<&str>,
    expires_at: Option<u64>,
) -> Result<(), String> {
    if let Some(rt) = refresh_token {
        keyring_entry(KEYRING_REFRESH)?
            .set_password(rt)
            .map_err(|e| format!("store refresh token: {e}"))?;
    }
    if let Some(at) = access_token {
        keyring_entry(KEYRING_ACCESS)?
            .set_password(at)
            .map_err(|e| format!("store access token: {e}"))?;
    }
    if let Some(exp) = expires_at {
        keyring_entry(KEYRING_ACCESS_EXPIRES)?
            .set_password(&exp.to_string())
            .map_err(|e| format!("store access expiry: {e}"))?;
    }
    Ok(())
}

pub fn load_refresh_token() -> Result<Option<String>, String> {
    match keyring_entry(KEYRING_REFRESH)?.get_password() {
        Ok(v) if !v.is_empty() => Ok(Some(v)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("read refresh token: {e}")),
    }
}

pub fn load_access_token_cache() -> Result<(Option<String>, Option<u64>), String> {
    let access = match keyring_entry(KEYRING_ACCESS)?.get_password() {
        Ok(v) if !v.is_empty() => Some(v),
        Ok(_) | Err(keyring::Error::NoEntry) => None,
        Err(e) => return Err(format!("read access token: {e}")),
    };
    let expires = match keyring_entry(KEYRING_ACCESS_EXPIRES)?.get_password() {
        Ok(v) => v.parse::<u64>().ok(),
        Err(keyring::Error::NoEntry) => None,
        Err(e) => return Err(format!("read access expiry: {e}")),
    };
    Ok((access, expires))
}

pub fn clear_tokens() -> Result<(), String> {
    for key in [KEYRING_REFRESH, KEYRING_ACCESS, KEYRING_ACCESS_EXPIRES] {
        match keyring_entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(format!("clear keyring {key}: {e}")),
        }
    }
    Ok(())
}

pub fn clear_link(app: &AppHandle) -> Result<(), String> {
    clear_tokens()?;
    save_state(app, &CloudSyncState::default())
}

pub fn set_last_error(app: &AppHandle, message: Option<String>) -> Result<(), String> {
    let mut state = load_state(app)?;
    state.last_error = message;
    save_state(app, &state)
}

pub fn mark_synced(app: &AppHandle, project_id: Option<&str>) -> Result<(), String> {
    let mut state = load_state(app)?;
    let now = now_secs();
    state.last_sync_at = Some(now);
    state.last_error = None;
    if let Some(pid) = project_id {
        if let Some(link) = state.projects.get_mut(pid) {
            link.last_sync_at = Some(now);
        }
    }
    save_state(app, &state)
}

pub fn is_linked(app: &AppHandle) -> bool {
    load_state(app)
        .ok()
        .and_then(|s| s.provider_id.clone())
        .is_some()
        && load_refresh_token().ok().flatten().is_some()
}
