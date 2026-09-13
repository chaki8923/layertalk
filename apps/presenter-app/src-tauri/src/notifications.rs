//! User-initiated room invitations. Secrets remain in Keychain or short-lived native memory.
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Manager, State, WebviewWindow};

const SERVICE: &str = "com.layertalk.channel-notifications.v1";
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Slack,
    Teams,
}
impl Provider {
    fn key(self) -> &'static str {
        match self {
            Self::Slack => "slack",
            Self::Teams => "teams",
        }
    }
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
    account_id: String,
    room_id: String,
}
impl Scope {
    fn key(&self, provider: Provider) -> Result<String, String> {
        let account = uuid::Uuid::parse_str(&self.account_id).map_err(|_| "invalid_scope")?;
        let room = uuid::Uuid::parse_str(&self.room_id).map_err(|_| "invalid_scope")?;
        Ok(format!("{account}:{room}:{}", provider.key()))
    }
}
#[derive(Clone, Deserialize, Serialize)]
struct Config {
    name: String,
    url: String,
    enabled: bool,
}
#[derive(Serialize)]
pub struct Destination {
    provider: Provider,
    name: String,
    enabled: bool,
}
#[derive(Deserialize)]
pub struct Save {
    name: String,
    url: Option<String>,
    enabled: bool,
}
#[derive(Serialize)]
pub struct Delivery {
    provider: Provider,
    name: String,
    status: String,
}
struct Batch {
    created: Instant,
    jobs: Vec<(Provider, Config)>,
    url: String,
    language: String,
    test: bool,
    automatic: bool,
}
#[derive(Default)]
pub struct NotificationState {
    batches: Mutex<HashMap<String, Batch>>,
    claimed: Mutex<HashSet<String>>,
}

fn control(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "control" {
        Ok(())
    } else {
        Err("not_allowed".into())
    }
}
fn webhook(provider: Provider, raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "invalid_webhook")?;
    let host = url.host_str().unwrap_or_default();
    let allowed = match provider {
        Provider::Slack => host == "hooks.slack.com" && url.path().starts_with("/services/"),
        Provider::Teams => {
            (host.ends_with(".logic.azure.com")
                || host.ends_with(".environment.api.powerplatform.com"))
                && url.path().contains("/workflows/")
                && url.path().ends_with("/invoke")
        }
    };
    if raw.len() > 8192
        || !allowed
        || url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.port_or_known_default() != Some(443)
    {
        return Err("invalid_webhook".into());
    }
    Ok(url)
}
fn audience(raw: &str) -> Result<(), String> {
    let url = Url::parse(raw).map_err(|_| "invalid_audience")?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https"
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.parse::<std::net::IpAddr>().is_ok()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.path().contains("/r/")
    {
        return Err("invalid_audience".into());
    }
    Ok(())
}
#[cfg(target_os = "macos")]
fn read(key: &str) -> Result<Option<Config>, String> {
    match security_framework::passwords::get_generic_password(SERVICE, key) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| "storage_error".into()),
        Err(e) if e.code() == -25300 => Ok(None), // errSecItemNotFound only; denial is not an empty setting.
        Err(_) => Err("storage_error".into()),
    }
}
#[cfg(target_os = "macos")]
fn write(key: &str, config: &Config) -> Result<(), String> {
    let bytes = serde_json::to_vec(config).map_err(|_| "storage_error")?;
    security_framework::passwords::set_generic_password(SERVICE, key, &bytes)
        .map_err(|_| "storage_error".into())
}
#[cfg(target_os = "macos")]
fn delete(key: &str) -> Result<(), String> {
    match security_framework::passwords::delete_generic_password(SERVICE, key) {
        Ok(()) => Ok(()),
        Err(e) if e.code() == -25300 => Ok(()),
        Err(_) => Err("storage_error".into()),
    }
}
#[cfg(not(target_os = "macos"))]
fn read(_: &str) -> Result<Option<Config>, String> {
    Err("unsupported".into())
}
#[cfg(not(target_os = "macos"))]
fn write(_: &str, _: &Config) -> Result<(), String> {
    Err("unsupported".into())
}
#[cfg(not(target_os = "macos"))]
fn delete(_: &str) -> Result<(), String> {
    Err("unsupported".into())
}
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| "storage_error")?
}
fn summary(provider: Provider, config: Config) -> Destination {
    Destination {
        provider,
        name: config.name,
        enabled: config.enabled,
    }
}
#[tauri::command]
pub async fn notification_list(
    window: WebviewWindow,
    scope: Scope,
) -> Result<Vec<Destination>, String> {
    control(&window)?;
    blocking(move || {
        let mut list = Vec::new();
        for provider in [Provider::Slack, Provider::Teams] {
            if let Some(config) = read(&scope.key(provider)?)? {
                list.push(summary(provider, config));
            }
        }
        Ok(list)
    })
    .await
}
#[tauri::command]
pub async fn notification_save(
    window: WebviewWindow,
    scope: Scope,
    provider: Provider,
    input: Save,
) -> Result<Destination, String> {
    control(&window)?;
    blocking(move || {
        let key = scope.key(provider)?;
        let name = input.name.trim().to_owned();
        if name.is_empty() || name.chars().count() > 80 {
            return Err("invalid_name".into());
        }
        let url = match input.url {
            Some(url) => webhook(provider, url.trim())?.to_string(),
            None => read(&key)?.ok_or("missing_webhook")?.url,
        };
        let config = Config {
            name,
            url,
            enabled: input.enabled,
        };
        write(&key, &config)?;
        Ok(summary(provider, config))
    })
    .await
}
#[tauri::command]
pub async fn notification_delete(
    window: WebviewWindow,
    scope: Scope,
    provider: Provider,
) -> Result<(), String> {
    control(&window)?;
    blocking(move || delete(&scope.key(provider)?)).await
}
// Preparation never sends. It freezes destinations before asynchronous presentation startup.
#[tauri::command]
pub async fn notification_prepare(
    window: WebviewWindow,
    scope: Scope,
    request_id: String,
    audience_url: String,
    language: String,
    provider: Option<Provider>,
    test: bool,
) -> Result<usize, String> {
    control(&window)?;
    uuid::Uuid::parse_str(&request_id).map_err(|_| "invalid_request")?;
    let jobs = blocking(move || {
        let mut jobs = Vec::new();
        for p in [Provider::Slack, Provider::Teams] {
            if provider.is_some_and(|selected| selected != p) {
                continue;
            }
            if let Some(config) = read(&scope.key(p)?)? {
                if config.enabled || provider.is_some() {
                    jobs.push((p, config));
                }
            }
        }
        Ok(jobs)
    })
    .await?;
    if !jobs.is_empty() {
        audience(&audience_url)?;
    }
    let count = jobs.len();
    let state = window.state::<NotificationState>();
    let mut claimed = state.claimed.lock().map_err(|_| "internal_error")?;
    if !claimed.insert(request_id.clone()) {
        return Err("duplicate_request".into());
    }
    let mut batches = state.batches.lock().map_err(|_| "internal_error")?;
    batches.retain(|_, batch| batch.created.elapsed() < Duration::from_secs(120));
    batches.insert(
        request_id,
        Batch {
            created: Instant::now(),
            jobs,
            url: audience_url,
            language,
            test,
            automatic: provider.is_none(),
        },
    );
    Ok(count)
}
fn payload(provider: Provider, url: &str, language: &str, test: bool) -> Value {
    let text = match (language == "ja", test) {
        (true, false) => "プレゼンが始まりました。こちらから参加してください。",
        (false, false) => "The presentation has started. Join here.",
        (true, true) => "LayerTalkのテスト送信です。参加URLをご確認ください。",
        (false, true) => "This is a LayerTalk test message. Please check the join URL.",
    };
    match provider {
        Provider::Slack => {
            json!({"text": format!("{text}\n{url}"), "unfurl_links": false, "unfurl_media": false})
        }
        Provider::Teams => {
            json!({"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","contentUrl":null,
            "content":{"$schema":"http://adaptivecards.io/schemas/adaptive-card.json","type":"AdaptiveCard","version":"1.2",
            "body":[{"type":"TextBlock","text":text,"wrap":true},{"type":"TextBlock","text":url,"wrap":true}]}}]})
        }
    }
}
async fn deliver(client: Client, provider: Provider, config: Config, body: Value) -> Delivery {
    // Do not stringify reqwest errors: they include the secret webhook URL.
    let status = match webhook(provider, &config.url) {
        Err(_) => "invalid_webhook".into(),
        Ok(url) => post(&client, provider, url, body).await,
    };
    Delivery {
        provider,
        name: config.name,
        status,
    }
}
async fn post(client: &Client, provider: Provider, url: Url, body: Value) -> String {
    match client.post(url).json(&body).send().await {
        Ok(response) => {
            let code = response.status();
            if code.is_success() {
                if provider == Provider::Teams {
                    "accepted".into()
                } else {
                    match response.text().await {
                        Ok(body) if body.trim() == "ok" => "sent".into(),
                        _ => "unknown".into(),
                    }
                }
            } else if code.as_u16() == 429 {
                "rate_limited".into()
            } else if matches!(code.as_u16(), 401 | 403 | 404 | 410) {
                "rejected".into()
            } else {
                "failed".into()
            }
        }
        Err(error) if error.is_connect() => "offline".into(),
        Err(_) => "unknown".into(),
    }
}
fn take_batch(state: &NotificationState, request_id: &str, live: bool) -> Result<Batch, String> {
    let batch = state
        .batches
        .lock()
        .map_err(|_| "internal_error")?
        .remove(request_id)
        .ok_or("duplicate_request")?;
    if (batch.automatic && !live) || batch.created.elapsed() >= Duration::from_secs(120) {
        return Err("expired_request".into());
    }
    Ok(batch)
}
#[tauri::command]
pub async fn notification_dispatch(
    window: WebviewWindow,
    state: State<'_, NotificationState>,
    request_id: String,
) -> Result<Vec<Delivery>, String> {
    control(&window)?;
    let batch = take_batch(&state, &request_id, super::is_live(window.app_handle()))?;
    let client = Client::builder()
        .https_only(true)
        .retry(reqwest::retry::never())
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "internal_error")?;
    let tasks: Vec<_> = batch
        .jobs
        .into_iter()
        .map(|(provider, config)| {
            tauri::async_runtime::spawn(deliver(
                client.clone(),
                provider,
                config,
                payload(provider, &batch.url, &batch.language, batch.test),
            ))
        })
        .collect();
    let mut results = Vec::new();
    for task in tasks {
        results.push(task.await.map_err(|_| "internal_error")?);
    }
    Ok(results)
}
#[tauri::command]
pub fn notification_cancel(
    window: WebviewWindow,
    state: State<'_, NotificationState>,
    request_id: String,
) -> Result<(), String> {
    control(&window)?;
    state
        .batches
        .lock()
        .map_err(|_| "internal_error")?
        .remove(&request_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restricts_webhook_destinations() {
        assert!(webhook(
            Provider::Slack,
            "https://hooks.slack.com/services/T/B/secret"
        )
        .is_ok());
        assert!(webhook(Provider::Teams, "https://example.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/id/triggers/manual/paths/invoke?sig=secret").is_ok());
        for url in [
            "http://hooks.slack.com/services/a",
            "https://hooks.slack.com.evil.test/services/a",
            "https://user:pass@hooks.slack.com/services/a",
            "https://127.0.0.1/services/a",
            "https://hooks.slack.com:444/services/a",
        ] {
            assert!(webhook(Provider::Slack, url).is_err());
        }
        assert!(webhook(Provider::Teams, "https://outlook.office.com/webhook/old").is_err());
    }
    #[test]
    fn account_and_room_are_separate_keychain_namespaces() {
        let s = Scope {
            account_id: "11111111-1111-1111-1111-111111111111".into(),
            room_id: "22222222-2222-2222-2222-222222222222".into(),
        };
        let other = Scope {
            account_id: s.room_id.clone(),
            room_id: s.account_id.clone(),
        };
        assert_ne!(
            s.key(Provider::Slack).unwrap(),
            other.key(Provider::Slack).unwrap()
        );
        assert_ne!(
            s.key(Provider::Slack).unwrap(),
            s.key(Provider::Teams).unwrap()
        );
    }
    #[test]
    fn safe_payload_and_public_audience() {
        let url = "https://www.layer-talk.com/r/ABC123";
        assert!(audience(url).is_ok());
        assert!(audience("http://localhost:3000/r/ABC123").is_err());
        assert!(audience("https://www.layer-talk.com/r/ABC123?passcode=secret").is_err());
        let slack = payload(Provider::Slack, url, "ja", false);
        assert_eq!(
            slack["text"],
            format!("プレゼンが始まりました。こちらから参加してください。\n{url}")
        );
        let teams = payload(Provider::Teams, url, "en", true);
        assert_eq!(teams["attachments"][0]["content"]["body"][1]["text"], url);
        let summary = serde_json::to_string(&summary(
            Provider::Slack,
            Config {
                name: "channel".into(),
                url: "SECRET".into(),
                enabled: true,
            },
        ))
        .unwrap();
        assert!(!summary.contains("SECRET"));
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::io::{Read, Write};
    fn batch() -> Batch {
        Batch {
            created: Instant::now(),
            jobs: vec![],
            url: String::new(),
            language: "en".into(),
            test: false,
            automatic: true,
        }
    }
    #[test]
    fn consumes_each_start_once_and_rejects_stopped_or_expired_starts() {
        let state = NotificationState::default();
        state
            .batches
            .lock()
            .unwrap()
            .insert("start1".into(), batch());
        assert!(take_batch(&state, "start1", true).is_ok());
        assert!(take_batch(&state, "start1", true).is_err());
        state
            .batches
            .lock()
            .unwrap()
            .insert("start2".into(), batch());
        assert!(take_batch(&state, "start2", false).is_err());
        let mut old = batch();
        old.created = Instant::now() - Duration::from_secs(121);
        state.batches.lock().unwrap().insert("old".into(), old);
        assert!(take_batch(&state, "old", true).is_err());
        state
            .batches
            .lock()
            .unwrap()
            .insert("start3".into(), batch());
        assert!(take_batch(&state, "start3", true).is_ok());
    }
    // Only a local HTTP fixture is used; production validates HTTPS service URLs before post().
    fn mock_post(provider: Provider, response: &'static str, delay: Duration) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = Url::parse(&format!(
            "http://{}/fixture",
            listener.local_addr().unwrap()
        ))
        .unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut buffer = [0u8; 4096];
            let _ = socket.read(&mut buffer);
            std::thread::sleep(delay);
            let _ = socket.write_all(response.as_bytes());
        });
        let result = tauri::async_runtime::block_on(async {
            let client = Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .retry(reqwest::retry::never())
                .timeout(Duration::from_millis(100))
                .build()
                .unwrap();
            post(&client, provider, url, json!({"text":"fixture"})).await
        });
        server.join().unwrap();
        result
    }
    #[test]
    fn mock_http_delivery_classification_and_timeout() {
        assert_eq!(
            mock_post(
                Provider::Slack,
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
                Duration::ZERO
            ),
            "sent"
        );
        assert_eq!(
            mock_post(
                Provider::Teams,
                "HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\n\r\n",
                Duration::ZERO
            ),
            "accepted"
        );
        assert_eq!(
            mock_post(
                Provider::Slack,
                "HTTP/1.1 410 Gone\r\nContent-Length: 0\r\n\r\n",
                Duration::ZERO
            ),
            "rejected"
        );
        assert_eq!(
            mock_post(
                Provider::Slack,
                "HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\n\r\n",
                Duration::ZERO
            ),
            "rate_limited"
        );
        assert_eq!(
            mock_post(
                Provider::Teams,
                "HTTP/1.1 302 Found\r\nLocation: https://example.com/\r\nContent-Length: 0\r\n\r\n",
                Duration::ZERO
            ),
            "failed"
        );
        assert_eq!(
            mock_post(
                Provider::Slack,
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
                Duration::from_millis(250)
            ),
            "unknown"
        );
    }
    #[test]
    #[ignore = "Uses a temporary Keychain item; run explicitly on macOS"]
    #[cfg(target_os = "macos")]
    fn keychain_round_trip() {
        let key = format!(
            "test:{}:{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = delete(&self.0);
            }
        }
        let _cleanup = Cleanup(key.clone());
        assert!(read(&key).unwrap().is_none());
        let mut config = Config {
            name: "Fixture".into(),
            url: "https://hooks.slack.com/services/TEST/TEST/NOT-A-REAL-SECRET".into(),
            enabled: false,
        };
        write(&key, &config).unwrap();
        assert_eq!(read(&key).unwrap().unwrap().url, config.url);
        config.enabled = true;
        write(&key, &config).unwrap();
        assert!(read(&key).unwrap().unwrap().enabled);
        delete(&key).unwrap();
        assert!(read(&key).unwrap().is_none());
    }
}
