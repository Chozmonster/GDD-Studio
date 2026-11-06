//! Google Drive API v3 provider (visible `GDD Studio/` folder tree).
//!
//! Uses `drive.file` scope so the app can create/manage files it creates
//! without a broad Drive dump. Client id comes from env / build placeholder —
//! never commit secrets.

use super::provider::{
    CloudProvider, RemoteEntry, RemoteEntryKind, RemoteFileMeta, RemoteFolder, TokenSet,
    PROVIDER_GOOGLE_DRIVE,
};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DRIVE_API: &str = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE: &str = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

/// Public OAuth client id (not a secret). Prefer env so release builds can
/// inject without baking a personal project into the public repo.
pub fn google_client_id() -> Option<String> {
    std::env::var("GDD_STUDIO_GOOGLE_CLIENT_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            option_env!("GDD_STUDIO_GOOGLE_CLIENT_ID")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
}

/// Optional client secret for Google "Desktop" / Web clients that still require it.
/// Prefer a public PKCE-only Desktop client with no secret.
fn google_client_secret() -> Option<String> {
    std::env::var("GDD_STUDIO_GOOGLE_CLIENT_SECRET")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn credentials_configured() -> bool {
    google_client_id().is_some()
}

pub struct GoogleDriveProvider {
    client: reqwest::Client,
    client_id: String,
    client_secret: Option<String>,
}

impl GoogleDriveProvider {
    pub fn try_new() -> Result<Self, String> {
        let client_id = google_client_id().ok_or_else(|| {
            "Google Drive OAuth is not configured. Set GDD_STUDIO_GOOGLE_CLIENT_ID \
             (Desktop/public client preferred). See docs/cloud-sync-oauth-setup.md \
             in the project store / help."
                .to_string()
        })?;
        let client = reqwest::Client::builder()
            .user_agent(format!("GDD-Studio/{}", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| format!("HTTP client: {e}"))?;
        Ok(Self {
            client,
            client_id,
            client_secret: google_client_secret(),
        })
    }

    fn auth_header(token: &str) -> String {
        format!("Bearer {token}")
    }

    async fn token_request(&self, form: &[(&str, &str)]) -> Result<TokenSet, String> {
        let mut params: Vec<(&str, String)> = form
            .iter()
            .map(|(k, v)| (*k, (*v).to_string()))
            .collect();
        params.push(("client_id", self.client_id.clone()));
        if let Some(secret) = &self.client_secret {
            params.push(("client_secret", secret.clone()));
        }

        let resp = self
            .client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("token request: {e}"))?;
        let status = resp.status();
        let body = resp.text().await.map_err(|e| format!("token body: {e}"))?;
        if !status.is_success() {
            return Err(format!("OAuth token exchange failed ({status}): {body}"));
        }
        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
            refresh_token: Option<String>,
            expires_in: Option<u64>,
            token_type: Option<String>,
            scope: Option<String>,
        }
        let parsed: TokenResponse =
            serde_json::from_str(&body).map_err(|e| format!("parse token response: {e}"))?;
        let expires_at = parsed.expires_in.map(|secs| {
            crate::store::now_secs().saturating_add(secs.saturating_sub(60))
        });
        Ok(TokenSet {
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
            expires_at,
            token_type: parsed.token_type,
            scope: parsed.scope,
        })
    }
}

#[derive(Deserialize)]
struct DriveFile {
    id: String,
    name: String,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    #[serde(rename = "modifiedTime")]
    modified_time: Option<String>,
    size: Option<String>,
    #[serde(rename = "md5Checksum")]
    md5_checksum: Option<String>,
}

#[derive(Deserialize)]
struct DriveList {
    files: Option<Vec<DriveFile>>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

fn to_entry(f: DriveFile) -> RemoteEntry {
    let kind = if f.mime_type.as_deref() == Some("application/vnd.google-apps.folder") {
        RemoteEntryKind::Folder
    } else {
        RemoteEntryKind::File
    };
    RemoteEntry {
        id: f.id,
        name: f.name,
        kind,
        modified_time: f.modified_time,
        size: f.size.and_then(|s| s.parse().ok()),
        md5_checksum: f.md5_checksum,
    }
}

#[async_trait]
impl CloudProvider for GoogleDriveProvider {
    fn id(&self) -> &'static str {
        PROVIDER_GOOGLE_DRIVE
    }

    fn display_name(&self) -> &'static str {
        "Google Drive"
    }

    fn authorize_url(&self, redirect_uri: &str, oauth_state: &str, code_challenge: &str) -> String {
        format!(
            "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
            urlencoding::encode(&self.client_id),
            urlencoding::encode(redirect_uri),
            urlencoding::encode(SCOPE),
            urlencoding::encode(oauth_state),
            urlencoding::encode(code_challenge),
        )
    }

    async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
        code_verifier: &str,
    ) -> Result<TokenSet, String> {
        self.token_request(&[
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier),
        ])
        .await
    }

    async fn refresh_access_token(&self, refresh_token: &str) -> Result<TokenSet, String> {
        self.token_request(&[
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .await
    }

    async fn fetch_account_label(&self, access_token: &str) -> Result<Option<String>, String> {
        let resp = self
            .client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .header("Authorization", Self::auth_header(access_token))
            .send()
            .await
            .map_err(|e| format!("userinfo: {e}"))?;
        if !resp.status().is_success() {
            return Ok(None);
        }
        #[derive(Deserialize)]
        struct Info {
            email: Option<String>,
        }
        let info: Info = resp.json().await.map_err(|e| format!("userinfo json: {e}"))?;
        Ok(info.email)
    }

    async fn ensure_root(
        &self,
        access_token: &str,
        root_name: &str,
    ) -> Result<RemoteFolder, String> {
        // Prefer an existing app-created folder with this name under My Drive.
        let q = format!(
            "name = '{}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents",
            root_name.replace('\'', "\\'")
        );
        let resp = self
            .client
            .get(format!("{DRIVE_API}/files"))
            .header("Authorization", Self::auth_header(access_token))
            .query(&[
                ("q", q.as_str()),
                ("spaces", "drive"),
                ("fields", "files(id,name)"),
                ("pageSize", "10"),
            ])
            .send()
            .await
            .map_err(|e| format!("list root folders: {e}"))?;
        let status = resp.status();
        let body = resp.text().await.map_err(|e| format!("list root body: {e}"))?;
        if !status.is_success() {
            return Err(format!("list Drive folders failed ({status}): {body}"));
        }
        let list: DriveList =
            serde_json::from_str(&body).map_err(|e| format!("parse folder list: {e}"))?;
        if let Some(f) = list.files.into_iter().flatten().next() {
            return Ok(RemoteFolder {
                id: f.id,
                name: f.name,
            });
        }
        self.create_folder(access_token, "root", root_name).await
    }

    async fn list_children(
        &self,
        access_token: &str,
        parent_id: &str,
    ) -> Result<Vec<RemoteEntry>, String> {
        let mut out = Vec::new();
        let mut page_token: Option<String> = None;
        loop {
            let q = format!("'{}' in parents and trashed = false", parent_id.replace('\'', "\\'"));
            let mut req = self
                .client
                .get(format!("{DRIVE_API}/files"))
                .header("Authorization", Self::auth_header(access_token))
                .query(&[
                    ("q", q.as_str()),
                    (
                        "fields",
                        "nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum)",
                    ),
                    ("pageSize", "1000"),
                    ("spaces", "drive"),
                ]);
            if let Some(token) = &page_token {
                req = req.query(&[("pageToken", token.as_str())]);
            }
            let resp = req.send().await.map_err(|e| format!("list children: {e}"))?;
            let status = resp.status();
            let body = resp.text().await.map_err(|e| format!("list body: {e}"))?;
            if !status.is_success() {
                return Err(format!("list Drive children failed ({status}): {body}"));
            }
            let list: DriveList =
                serde_json::from_str(&body).map_err(|e| format!("parse children: {e}"))?;
            for f in list.files.unwrap_or_default() {
                out.push(to_entry(f));
            }
            page_token = list.next_page_token;
            if page_token.is_none() {
                break;
            }
        }
        Ok(out)
    }

    async fn create_folder(
        &self,
        access_token: &str,
        parent_id: &str,
        name: &str,
    ) -> Result<RemoteFolder, String> {
        let meta = json!({
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        });
        let resp = self
            .client
            .post(format!("{DRIVE_API}/files"))
            .header("Authorization", Self::auth_header(access_token))
            .query(&[("fields", "id,name")])
            .json(&meta)
            .send()
            .await
            .map_err(|e| format!("create folder: {e}"))?;
        let status = resp.status();
        let body = resp.text().await.map_err(|e| format!("create folder body: {e}"))?;
        if !status.is_success() {
            return Err(format!("create Drive folder failed ({status}): {body}"));
        }
        let f: DriveFile =
            serde_json::from_str(&body).map_err(|e| format!("parse create folder: {e}"))?;
        Ok(RemoteFolder {
            id: f.id,
            name: f.name,
        })
    }

    async fn upload_file(
        &self,
        access_token: &str,
        parent_id: &str,
        name: &str,
        bytes: &[u8],
        existing_file_id: Option<&str>,
    ) -> Result<RemoteFileMeta, String> {
        if let Some(file_id) = existing_file_id {
            let resp = self
                .client
                .patch(format!("{DRIVE_UPLOAD}/{file_id}"))
                .header("Authorization", Self::auth_header(access_token))
                .query(&[
                    ("uploadType", "media"),
                    ("fields", "id,name,modifiedTime,size,md5Checksum"),
                ])
                .header("Content-Type", "application/octet-stream")
                .body(bytes.to_vec())
                .send()
                .await
                .map_err(|e| format!("update file: {e}"))?;
            let status = resp.status();
            let body = resp.text().await.map_err(|e| format!("update body: {e}"))?;
            if !status.is_success() {
                return Err(format!("update Drive file failed ({status}): {body}"));
            }
            let f: DriveFile =
                serde_json::from_str(&body).map_err(|e| format!("parse update file: {e}"))?;
            return Ok(RemoteFileMeta {
                id: f.id,
                name: f.name,
                modified_time: f.modified_time,
                size: f.size.and_then(|s| s.parse().ok()),
                md5_checksum: f.md5_checksum,
            });
        }

        let metadata = json!({
            "name": name,
            "parents": [parent_id],
        });
        let meta_bytes = serde_json::to_vec(&metadata).map_err(|e| e.to_string())?;
        let boundary = format!("gdds_{}", crate::store::now_secs());
        let mut body = Vec::new();
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
        body.extend_from_slice(&meta_bytes);
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());

        let resp = self
            .client
            .post(DRIVE_UPLOAD)
            .header("Authorization", Self::auth_header(access_token))
            .query(&[
                ("uploadType", "multipart"),
                ("fields", "id,name,modifiedTime,size,md5Checksum"),
            ])
            .header(
                "Content-Type",
                format!("multipart/related; boundary={boundary}"),
            )
            .body(body)
            .send()
            .await
            .map_err(|e| format!("upload file: {e}"))?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| format!("upload body: {e}"))?;
        if !status.is_success() {
            return Err(format!("upload Drive file failed ({status}): {text}"));
        }
        let f: DriveFile =
            serde_json::from_str(&text).map_err(|e| format!("parse upload file: {e}"))?;
        Ok(RemoteFileMeta {
            id: f.id,
            name: f.name,
            modified_time: f.modified_time,
            size: f.size.and_then(|s| s.parse().ok()),
            md5_checksum: f.md5_checksum,
        })
    }

    async fn download_file(&self, access_token: &str, file_id: &str) -> Result<Vec<u8>, String> {
        let resp = self
            .client
            .get(format!("{DRIVE_API}/files/{file_id}"))
            .header("Authorization", Self::auth_header(access_token))
            .query(&[("alt", "media")])
            .send()
            .await
            .map_err(|e| format!("download file: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("download Drive file failed ({status}): {body}"));
        }
        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("download bytes: {e}"))
    }

    async fn delete_entry(&self, access_token: &str, id: &str) -> Result<(), String> {
        let resp = self
            .client
            .delete(format!("{DRIVE_API}/files/{id}"))
            .header("Authorization", Self::auth_header(access_token))
            .send()
            .await
            .map_err(|e| format!("delete entry: {e}"))?;
        let status = resp.status();
        if !(status.is_success() || status.as_u16() == 204 || status.as_u16() == 404) {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("delete Drive entry failed ({status}): {body}"));
        }
        Ok(())
    }

    async fn get_metadata(&self, access_token: &str, id: &str) -> Result<RemoteEntry, String> {
        let resp = self
            .client
            .get(format!("{DRIVE_API}/files/{id}"))
            .header("Authorization", Self::auth_header(access_token))
            .query(&[("fields", "id,name,mimeType,modifiedTime,size,md5Checksum")])
            .send()
            .await
            .map_err(|e| format!("get metadata: {e}"))?;
        let status = resp.status();
        let body = resp.text().await.map_err(|e| format!("metadata body: {e}"))?;
        if !status.is_success() {
            return Err(format!("get Drive metadata failed ({status}): {body}"));
        }
        let f: DriveFile =
            serde_json::from_str(&body).map_err(|e| format!("parse metadata: {e}"))?;
        Ok(to_entry(f))
    }
}
