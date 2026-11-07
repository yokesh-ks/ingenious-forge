//! Settings (PRD §6.2 Settings): model provider API keys, stored
//! encrypted (ADR 0008) and never sent back to the browser.

use std::{collections::BTreeMap, sync::Arc, time::Duration};

use agent::providers::{current_key, KeyHandle};
use api_types::{
    KeySource, ProviderKeyStatus, ProviderKeyTest, SessionDefaults, SetProviderKeyRequest,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use services::secrets::{hint, SecretStore};

use crate::{projects::ApiFailure, state::AppState};

/// A provider whose key can be set in Settings.
#[derive(Clone)]
pub struct ProviderKey {
    pub name: String,
    /// The key the provider's clients read.
    pub handle: KeyHandle,
    /// The key from the environment, used when none is saved.
    pub env: Option<String>,
}

/// Settings state: where secrets are kept and each provider's key.
#[derive(Clone, Default)]
pub struct Settings {
    pub secrets: Option<SecretStore>,
    pub providers: BTreeMap<String, ProviderKey>,
    /// The GitHub API base URL; GitHub's own when `None`.
    pub github_api: Option<String>,
}

/// The name a provider's key is stored under.
fn secret_name(provider: &str) -> String {
    format!("provider-key:{provider}")
}

impl Settings {
    /// Points each provider at its saved key, or its environment key.
    pub async fn load(&self) {
        for (id, provider) in &self.providers {
            let saved = match &self.secrets {
                Some(store) => store.get(&secret_name(id)).await.unwrap_or_else(|err| {
                    tracing::warn!(%err, provider = %id, "ignoring a stored key");
                    None
                }),
                None => None,
            };
            if let Ok(mut key) = provider.handle.write() {
                *key = saved.or_else(|| provider.env.clone());
            }
        }
    }

    async fn status(&self, id: &str, provider: &ProviderKey) -> ProviderKeyStatus {
        let saved = match &self.secrets {
            Some(store) => store.get(&secret_name(id)).await.ok().flatten(),
            None => None,
        };
        let (key, source) = match (saved, &provider.env) {
            (Some(key), _) => (Some(key), Some(KeySource::Settings)),
            (None, Some(env)) => (Some(env.clone()), Some(KeySource::Environment)),
            (None, None) => (None, None),
        };
        ProviderKeyStatus {
            provider: id.to_string(),
            name: provider.name.clone(),
            hint: key.as_deref().map(hint),
            source,
        }
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/settings/providers", get(list_providers))
        .route(
            "/settings/providers/{id}/key",
            put(set_key).delete(remove_key),
        )
        .route("/settings/providers/{id}/key/test", post(test_key))
        .route("/settings/defaults", get(get_defaults).put(set_defaults))
}

const DEFAULTS: &str = "session-defaults";

/// The saved new-session defaults; the built-in ones when none are saved
/// or they cannot be read.
pub async fn defaults(state: &AppState) -> SessionDefaults {
    match db::get_setting(&state.db, DEFAULTS).await {
        Ok(Some(json)) => serde_json::from_str(&json).unwrap_or_default(),
        Ok(None) => SessionDefaults::default(),
        Err(err) => {
            tracing::warn!(%err, "cannot read session defaults");
            SessionDefaults::default()
        }
    }
}

async fn get_defaults(State(state): State<Arc<AppState>>) -> Json<SessionDefaults> {
    Json(defaults(&state).await)
}

/// Saves the new-session defaults. Sessions already created keep theirs.
async fn set_defaults(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SessionDefaults>,
) -> Result<Json<SessionDefaults>, ApiFailure> {
    if let Some(model) = &body.model {
        state
            .agent
            .providers()
            .check_usable(&model.into())
            .map_err(|err| ApiFailure::new(StatusCode::BAD_REQUEST, err.to_string()))?;
    }
    let json = serde_json::to_string(&body).map_err(|e| ApiFailure::internal(e.to_string()))?;
    db::set_setting(&state.db, DEFAULTS, &json)
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))?;
    Ok(Json(body))
}

async fn list_providers(State(state): State<Arc<AppState>>) -> Json<Vec<ProviderKeyStatus>> {
    let settings = &state.settings;
    let mut out = Vec::new();
    for (id, provider) in &settings.providers {
        out.push(settings.status(id, provider).await);
    }
    Json(out)
}

fn provider<'a>(state: &'a AppState, id: &str) -> Result<&'a ProviderKey, ApiFailure> {
    state
        .settings
        .providers
        .get(id)
        .ok_or_else(|| ApiFailure::new(StatusCode::NOT_FOUND, format!("unknown provider: {id}")))
}

fn store(state: &AppState) -> Result<&SecretStore, ApiFailure> {
    state
        .settings
        .secrets
        .as_ref()
        .ok_or_else(|| ApiFailure::internal("secret storage is not available"))
}

/// Saves a provider's API key, encrypted; every session uses it from its next
/// request.
async fn set_key(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<SetProviderKeyRequest>,
) -> Result<Json<ProviderKeyStatus>, ApiFailure> {
    let provider = provider(&state, &id)?;
    let key = body.key.trim();
    if key.is_empty() {
        return Err(ApiFailure::new(StatusCode::BAD_REQUEST, "enter an API key"));
    }
    store(&state)?
        .set(&secret_name(&id), key)
        .await
        .map_err(ApiFailure::internal)?;
    if let Ok(mut handle) = provider.handle.write() {
        *handle = Some(key.to_string());
    }
    Ok(Json(state.settings.status(&id, provider).await))
}

/// How long a provider gets to answer a key test.
const KEY_TEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Asks the provider whether it accepts its current key. A rejection is a
/// normal result here, not an API failure. A provider's error can quote what
/// it was sent, so the key is removed from the message before it is returned.
async fn test_key(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ProviderKeyTest>, ApiFailure> {
    let provider = provider(&state, &id)?;
    let failed = |message: String| {
        Json(ProviderKeyTest {
            ok: false,
            message: Some(message),
        })
    };
    let Some(key) = current_key(&provider.handle) else {
        return Ok(failed(format!("{} has no API key to test", provider.name)));
    };
    let outcome = tokio::time::timeout(KEY_TEST_TIMEOUT, state.agent.providers().test_key(&id));
    Ok(match outcome.await {
        Ok(Ok(())) => Json(ProviderKeyTest {
            ok: true,
            message: None,
        }),
        Ok(Err(err)) => failed(err.to_string().replace(&key, &hint(&key))),
        Err(_) => failed(format!(
            "{} did not answer within {} seconds",
            provider.name,
            KEY_TEST_TIMEOUT.as_secs()
        )),
    })
}

/// Forgets a saved key; the provider falls back to its environment key.
async fn remove_key(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ProviderKeyStatus>, ApiFailure> {
    let provider = provider(&state, &id)?;
    store(&state)?
        .remove(&secret_name(&id))
        .await
        .map_err(ApiFailure::internal)?;
    if let Ok(mut handle) = provider.handle.write() {
        *handle = provider.env.clone();
    }
    Ok(Json(state.settings.status(&id, provider).await))
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, RwLock};

    use agent::Agent;
    use serde_json::{json, Value};
    use services::EventService;

    use super::*;

    struct NoModel;
    impl agent::model::ModelClient for NoModel {
        fn stream(
            &self,
            _: agent::model::ModelRequest,
        ) -> tokio::sync::mpsc::Receiver<Result<agent::model::ModelEvent, agent::model::ModelError>>
        {
            tokio::sync::mpsc::channel(1).1
        }
    }

    fn temp() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "forge-settings-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn settings(dir: &std::path::Path, env: Option<&str>) -> (Settings, KeyHandle) {
        let pool = db::connect(dir.join("forge.db").to_str().unwrap())
            .await
            .unwrap();
        let handle: KeyHandle = Arc::new(RwLock::new(None));
        let mut providers = BTreeMap::new();
        providers.insert(
            "anthropic".to_string(),
            ProviderKey {
                name: "Anthropic".into(),
                handle: handle.clone(),
                env: env.map(String::from),
            },
        );
        let settings = Settings {
            secrets: Some(SecretStore::open(pool, &dir.join("secret.key")).unwrap()),
            providers,
            github_api: None,
        };
        settings.load().await;
        (settings, handle)
    }

    async fn start(settings: Settings) -> String {
        let events = EventService::new();
        let state = Arc::new(AppState {
            db: db::connect(":memory:").await.unwrap(),
            agent: Agent::new(Arc::new(NoModel), events.clone()),
            events,
            terminals: Default::default(),
            settings,
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new().nest("/api", router()).with_state(state);
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}/api/settings/providers")
    }

    async fn call(method: reqwest::Method, url: &str, body: Option<Value>) -> (u16, String) {
        let mut req = reqwest::Client::new().request(method, url);
        if let Some(body) = body {
            req = req.json(&body);
        }
        let res = req.send().await.unwrap();
        (res.status().as_u16(), res.text().await.unwrap())
    }

    /// A stand-in for the Messages API that answers every request the same
    /// way and records the request bodies.
    async fn fake_api(status: u16, body: &'static str) -> (String, Arc<Mutex<Vec<Value>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let recorded = seen.clone();
        let app = Router::new().route(
            "/v1/messages",
            post(move |raw: String| {
                let recorded = recorded.clone();
                async move {
                    recorded
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str::<Value>(&raw).unwrap());
                    (StatusCode::from_u16(status).unwrap(), body)
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}"), seen)
    }

    /// The settings API with an Anthropic provider pointed at `base_url`.
    async fn start_with_anthropic(base_url: &str, key: Option<&str>) -> String {
        let anthropic =
            agent::anthropic::AnthropicProvider::new(key.map(String::from)).with_base_url(base_url);
        let mut keys = BTreeMap::new();
        keys.insert(
            "anthropic".to_string(),
            ProviderKey {
                name: "Anthropic".into(),
                handle: anthropic.key_handle(),
                env: None,
            },
        );
        let mut providers = agent::providers::Providers::new();
        providers.register(Arc::new(anthropic));
        let events = EventService::new();
        let state = Arc::new(AppState {
            db: db::connect(":memory:").await.unwrap(),
            agent: Agent::with_providers(providers, events.clone()),
            events,
            terminals: Default::default(),
            settings: Settings {
                providers: keys,
                ..Default::default()
            },
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new().nest("/api", router()).with_state(state);
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}/api/settings/providers")
    }

    #[tokio::test]
    async fn a_working_key_passes_with_a_one_token_request() {
        let stream = "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        let (url, seen) = fake_api(200, stream).await;
        let api = start_with_anthropic(&url, Some("sk-good")).await;

        let (status, body) = call(
            reqwest::Method::POST,
            &format!("{api}/anthropic/key/test"),
            None,
        )
        .await;

        assert_eq!(status, 200);
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(body, json!({ "ok": true, "message": null }));
        assert_eq!(seen.lock().unwrap()[0]["max_tokens"], 1);
    }

    #[tokio::test]
    async fn a_rejected_key_reports_the_providers_words_without_the_key() {
        let rejection = r#"{"error":{"message":"invalid x-api-key: sk-secret-1234"}}"#;
        let (url, _) = fake_api(401, rejection).await;
        let api = start_with_anthropic(&url, Some("sk-secret-1234")).await;

        let (status, body) = call(
            reqwest::Method::POST,
            &format!("{api}/anthropic/key/test"),
            None,
        )
        .await;

        assert_eq!(status, 200);
        assert!(!body.contains("sk-secret"), "{body}");
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(body["ok"], false);
        let message = body["message"].as_str().unwrap();
        assert!(message.contains("401") && message.contains("invalid x-api-key"));
        assert!(message.contains("…1234"), "{message}");
    }

    #[tokio::test]
    async fn testing_without_a_key_makes_no_request() {
        let (url, seen) = fake_api(200, "").await;
        let api = start_with_anthropic(&url, None).await;

        let (_, body) = call(
            reqwest::Method::POST,
            &format!("{api}/anthropic/key/test"),
            None,
        )
        .await;

        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(body["ok"], false);
        assert!(body["message"].as_str().unwrap().contains("no API key"));
        assert!(seen.lock().unwrap().is_empty());
        let (status, _) = call(reqwest::Method::POST, &format!("{api}/nope/key/test"), None).await;
        assert_eq!(status, 404);
    }

    #[tokio::test]
    async fn a_saved_key_is_used_and_never_sent_back() {
        let dir = temp();
        let (settings, handle) = settings(&dir, None).await;
        let api = start(settings).await;

        let (status, body) = call(
            reqwest::Method::PUT,
            &format!("{api}/anthropic/key"),
            Some(json!({ "key": "  sk-ant-secret-9876  " })),
        )
        .await;

        assert_eq!(status, 200);
        assert!(!body.contains("secret"), "{body}");
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(
            body,
            json!({ "provider": "anthropic", "name": "Anthropic", "hint": "…9876", "source": "settings" })
        );
        assert_eq!(
            handle.read().unwrap().as_deref(),
            Some("sk-ant-secret-9876")
        );

        let (_, listed) = call(reqwest::Method::GET, &api, None).await;
        assert!(!listed.contains("secret"), "{listed}");
        assert!(listed.contains("…9876"));
    }

    #[tokio::test]
    async fn a_saved_key_survives_a_restart() {
        let dir = temp();
        let (settings, _) = settings(&dir, None).await;
        let api = start(settings).await;
        call(
            reqwest::Method::PUT,
            &format!("{api}/anthropic/key"),
            Some(json!({ "key": "sk-1234" })),
        )
        .await;

        let (_, handle) = self::settings(&dir, None).await;
        assert_eq!(handle.read().unwrap().as_deref(), Some("sk-1234"));
    }

    #[tokio::test]
    async fn removing_the_key_falls_back_to_the_environment() {
        let dir = temp();
        let (settings, handle) = settings(&dir, Some("env-key-0000")).await;
        assert_eq!(handle.read().unwrap().as_deref(), Some("env-key-0000"));
        let api = start(settings).await;
        call(
            reqwest::Method::PUT,
            &format!("{api}/anthropic/key"),
            Some(json!({ "key": "saved-1111" })),
        )
        .await;

        let (status, body) = call(
            reqwest::Method::DELETE,
            &format!("{api}/anthropic/key"),
            None,
        )
        .await;

        assert_eq!(status, 200);
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(body["source"], "environment");
        assert_eq!(body["hint"], "…0000");
        assert_eq!(handle.read().unwrap().as_deref(), Some("env-key-0000"));
    }

    #[tokio::test]
    async fn a_blank_key_or_unknown_provider_is_refused() {
        let dir = temp();
        let (settings, _) = settings(&dir, None).await;
        let api = start(settings).await;
        let (status, _) = call(
            reqwest::Method::PUT,
            &format!("{api}/anthropic/key"),
            Some(json!({ "key": "   " })),
        )
        .await;
        assert_eq!(status, 400);
        let (status, _) = call(
            reqwest::Method::PUT,
            &format!("{api}/nope/key"),
            Some(json!({ "key": "x" })),
        )
        .await;
        assert_eq!(status, 404);
        let (_, listed) = call(reqwest::Method::GET, &api, None).await;
        let listed: Value = serde_json::from_str(&listed).unwrap();
        assert_eq!(listed[0]["source"], Value::Null);
    }
}
