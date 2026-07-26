//! BYOK secret storage.
//!
//! Provider API keys go to the OS credential store (Windows Credential
//! Manager / macOS Keychain / Secret Service), never to SQLite or a config
//! file. The webview asks for a key by provider id and gets it only when it
//! needs to open a channel; keys are never persisted by the frontend.

use keyring::Entry;

const SERVICE: &str = "interview-system";

fn entry(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, provider).map_err(|e| format!("keychain unavailable: {e}"))
}

#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return delete_api_key(provider);
    }
    entry(&provider)?
        .set_password(&key)
        .map_err(|e| format!("could not store key: {e}"))
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    match entry(&provider)?.get_password() {
        Ok(k) => Ok(Some(k)),
        // A missing key is a normal state (first run), not an error.
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read key: {e}")),
    }
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not delete key: {e}")),
    }
}

#[tauri::command]
pub fn has_api_key(provider: String) -> Result<bool, String> {
    Ok(get_api_key(provider)?.is_some())
}
