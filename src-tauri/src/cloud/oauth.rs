//! OAuth PKCE + loopback redirect for native desktop clients.
//!
//! Opens the system browser (not an embedded webview). Prefer public clients
//! with PKCE; an optional client secret is only used when the env provides one.

use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const OAUTH_TIMEOUT_SECS: u64 = 180;

pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

pub fn generate_pkce() -> PkcePair {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest);
    PkcePair {
        verifier,
        challenge,
    }
}

pub fn generate_oauth_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Bind an ephemeral loopback listener and return `(redirect_uri, listener)`.
pub fn bind_loopback() -> Result<(String, TcpListener), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("bind OAuth loopback: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("OAuth loopback addr: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    Ok((redirect_uri, listener))
}

/// Open the authorize URL in the user's default browser.
pub fn open_authorize_url(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| format!("open system browser for OAuth: {e}"))
}

/// Wait for `?code=` on the loopback listener. Validates `state`.
pub fn wait_for_auth_code(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("OAuth listener: {e}"))?;

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let expected = expected_state.to_string();

    thread::spawn(move || {
        let result = (|| {
            let (mut stream, _) = listener
                .accept()
                .map_err(|e| format!("OAuth callback accept: {e}"))?;
            let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));

            let mut buf = [0u8; 8192];
            let n = stream
                .read(&mut buf)
                .map_err(|e| format!("OAuth callback read: {e}"))?;
            let req = String::from_utf8_lossy(&buf[..n]);
            let first_line = req.lines().next().unwrap_or("");
            // GET /?code=...&state=... HTTP/1.1
            let path = first_line
                .split_whitespace()
                .nth(1)
                .ok_or_else(|| "Malformed OAuth callback request".to_string())?;
            let query = path
                .split_once('?')
                .map(|(_, q)| q)
                .unwrap_or("")
                .split('#')
                .next()
                .unwrap_or("");

            let mut code: Option<String> = None;
            let mut state: Option<String> = None;
            let mut error: Option<String> = None;
            let mut error_desc: Option<String> = None;
            for pair in query.split('&') {
                let mut parts = pair.splitn(2, '=');
                let k = parts.next().unwrap_or("");
                let v = urlencoding::decode(parts.next().unwrap_or(""))
                    .unwrap_or_default()
                    .into_owned();
                match k {
                    "code" => code = Some(v),
                    "state" => state = Some(v),
                    "error" => error = Some(v),
                    "error_description" => error_desc = Some(v),
                    _ => {}
                }
            }

            let body = if code.is_some() {
                "<!DOCTYPE html><html><body><h2>GDD Studio</h2><p>Signed in. You can close this tab and return to the app.</p></body></html>"
            } else {
                "<!DOCTYPE html><html><body><h2>GDD Studio</h2><p>Sign-in failed. You can close this tab and return to the app.</p></body></html>"
            };
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes());
            let _ = stream.flush();

            if let Some(err) = error {
                let detail = error_desc.unwrap_or_default();
                return Err(format!("OAuth provider error: {err} {detail}").trim().to_string());
            }
            let code = code.ok_or_else(|| "OAuth callback missing code".to_string())?;
            let state = state.ok_or_else(|| "OAuth callback missing state".to_string())?;
            if state != expected {
                return Err("OAuth state mismatch — try linking again".into());
            }
            Ok(code)
        })();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(Duration::from_secs(OAUTH_TIMEOUT_SECS)) {
        Ok(result) => result,
        Err(_) => Err(
            "Timed out waiting for Google sign-in. Open Options → Cloud sync and try Link again."
                .into(),
        ),
    }
}
