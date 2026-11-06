//! Shared cloud-storage abstraction.
//!
//! Google Drive is the first concrete provider (v1.5 Phase 1). OneDrive and
//! Dropbox plug in behind the same trait in a follow-up; keep this surface
//! provider-agnostic and free of Drive-only types.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Stable provider id stored in `cloud-sync.json`.
pub const PROVIDER_GOOGLE_DRIVE: &str = "google-drive";
pub const PROVIDER_ONEDRIVE: &str = "onedrive";
pub const PROVIDER_DROPBOX: &str = "dropbox";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<u64>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFolder {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileMeta {
    pub id: String,
    pub name: String,
    pub modified_time: Option<String>,
    pub size: Option<u64>,
    pub md5_checksum: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RemoteEntryKind {
    File,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub id: String,
    pub name: String,
    pub kind: RemoteEntryKind,
    pub modified_time: Option<String>,
    pub size: Option<u64>,
    pub md5_checksum: Option<String>,
}

/// Thin storage backend used by the sync engine.
///
/// Implementors: Google Drive (shipped), OneDrive / Dropbox (later).
#[async_trait]
pub trait CloudProvider: Send + Sync {
    #[allow(dead_code)] // used by future OneDrive/Dropbox UI labels
    fn id(&self) -> &'static str;
    #[allow(dead_code)]
    fn display_name(&self) -> &'static str;

    /// Build the system-browser authorize URL (PKCE).
    fn authorize_url(&self, redirect_uri: &str, oauth_state: &str, code_challenge: &str) -> String;

    async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
        code_verifier: &str,
    ) -> Result<TokenSet, String>;

    async fn refresh_access_token(&self, refresh_token: &str) -> Result<TokenSet, String>;

    /// Optional account email/label for Options status (best-effort).
    async fn fetch_account_label(&self, access_token: &str) -> Result<Option<String>, String>;

    async fn ensure_root(
        &self,
        access_token: &str,
        root_name: &str,
    ) -> Result<RemoteFolder, String>;

    async fn list_children(
        &self,
        access_token: &str,
        parent_id: &str,
    ) -> Result<Vec<RemoteEntry>, String>;

    async fn create_folder(
        &self,
        access_token: &str,
        parent_id: &str,
        name: &str,
    ) -> Result<RemoteFolder, String>;

    async fn upload_file(
        &self,
        access_token: &str,
        parent_id: &str,
        name: &str,
        bytes: &[u8],
        existing_file_id: Option<&str>,
    ) -> Result<RemoteFileMeta, String>;

    async fn download_file(&self, access_token: &str, file_id: &str) -> Result<Vec<u8>, String>;

    async fn delete_entry(&self, access_token: &str, id: &str) -> Result<(), String>;

    #[allow(dead_code)] // reserved for conflict / repair flows
    async fn get_metadata(&self, access_token: &str, id: &str) -> Result<RemoteEntry, String>;
}
