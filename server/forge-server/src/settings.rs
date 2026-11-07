//! Settings (PRD §6.2 Settings): model provider API keys, stored
//! encrypted (ADR 0008) and never sent back to the browser.

use std::{
    collections::BTreeMap,
    sync::{Arc, RwLock},
    time::Duration,
};

use agent::{
    anthropic::AnthropicProvider,
    openai_compat::{check_base_url, OpenAiCompatProvider},
    providers::{current_key, fetch_models, CustomizableProvider, KeyHandle, Providers},
};
use api_types::{
    AddCustomProviderRequest, ApiProtocol, FetchCustomModelsRequest, FetchModelsRequest, KeySource,
    ProviderCustomization, ProviderKeyStatus, ProviderKeyTest, ProviderModel, SessionDefaults,
    SetProviderKeyRequest,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use services::secrets::{hint, SecretStore};

use crate::{projects::ApiFailure, state::AppState};

/// A provider whose key can be set in Settings.
#[derive(Clone, Default)]
pub struct ProviderKey {
    pub name: String,
    /// One line on what the provider offers.
    pub description: String,
    /// The key the provider's clients read.
    pub handle: KeyHandle,
    /// The key from the environment, used when none is saved.
    pub env: Option<String>,
    /// The name of that environment variable, shown in Settings.
    pub env_var: String,
    /// True for a provider the user added.
    pub custom: bool,
    /// The adapter as it ships, which the user's changes are applied to.
    pub adapter: Option<Arc<dyn CustomizableProvider>>,
    /// What the user changed about it.
    pub customization: ProviderCustomization,
    /// The outcome of the last save or key test, if any.
    pub key_valid: Option<bool>,
}

/// A provider the user added, as it is saved. Its key is stored separately,
/// encrypted like every other.
#[derive(Clone, Serialize, Deserialize)]
struct CustomProvider {
    id: String,
    name: String,
    base_url: String,
    protocol: ApiProtocol,
    models: Vec<ProviderModel>,
}

const CUSTOM_PROVIDERS: &str = "custom-providers";
const CUSTOMIZATIONS: &str = "provider-customizations";
const KEY_RESULTS: &str = "provider-key-results";

/// Settings state: where secrets are kept and each provider's key.
#[derive(Clone, Default)]
pub struct Settings {
    pub secrets: Option<SecretStore>,
    /// Shared and locked because custom providers come and go while the
    /// server runs.
    pub providers: Arc<RwLock<BTreeMap<String, ProviderKey>>>,
    /// The GitHub API base URL; GitHub's own when `None`.
    pub github_api: Option<String>,
}

/// The name a provider's key is stored under.
fn secret_name(provider: &str) -> String {
    format!("provider-key:{provider}")
}

impl Settings {
    fn snapshot(&self) -> Vec<(String, ProviderKey)> {
        let providers = self.providers.read().unwrap();
        providers
            .iter()
            .map(|(id, provider)| (id.clone(), provider.clone()))
            .collect()
    }

    /// Registers the custom providers saved in `pool`. Run before [`Settings::load`].
    pub async fn load_custom(&self, pool: &sqlx::SqlitePool, providers: &Providers) {
        for custom in saved_custom_providers(pool).await {
            self.register_custom(&custom, providers);
        }
    }

    fn register_custom(&self, custom: &CustomProvider, providers: &Providers) -> KeyHandle {
        let (adapter, handle) = custom_adapter(custom);
        providers.add(adapter.customized(None, None));
        self.providers.write().unwrap().insert(
            custom.id.clone(),
            ProviderKey {
                name: custom.name.clone(),
                description: custom.base_url.clone(),
                handle: handle.clone(),
                env: None,
                env_var: String::new(),
                custom: true,
                adapter: Some(adapter),
                customization: ProviderCustomization::default(),
                key_valid: None,
            },
        );
        handle
    }

    /// Applies the provider changes saved in `pool`. Run after
    /// [`Settings::load_custom`].
    pub async fn load_customizations(&self, pool: &sqlx::SqlitePool, providers: &Providers) {
        for (id, customization) in saved_customizations(pool).await {
            self.apply_customization(&id, customization, providers);
        }
    }

    /// Restores the last known state of each provider's key. Run after
    /// [`Settings::load_custom`].
    pub async fn load_key_results(&self, pool: &sqlx::SqlitePool) {
        let saved = saved_key_results(pool).await;
        let mut all = self.providers.write().unwrap();
        for (id, valid) in saved {
            if let Some(provider) = all.get_mut(&id) {
                provider.key_valid = Some(valid);
            }
        }
    }

    /// Swaps in the adapter with `customization` applied. It shares the
    /// provider's key, and sessions already open keep their client.
    fn apply_customization(
        &self,
        id: &str,
        customization: ProviderCustomization,
        providers: &Providers,
    ) {
        let mut all = self.providers.write().unwrap();
        let Some(provider) = all.get_mut(id) else {
            return;
        };
        if let Some(adapter) = &provider.adapter {
            providers.add(adapter.customized(
                customization.base_url.as_deref(),
                customization.models.as_deref(),
            ));
        }
        provider.customization = customization;
    }

    /// Points each provider at its saved key, or its environment key.
    pub async fn load(&self) {
        for (id, provider) in &self.snapshot() {
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
            description: provider.description.clone(),
            hint: key.as_deref().map(hint),
            source,
            env_var: provider.env_var.clone(),
            custom: provider.custom,
            base_url: provider.customization.base_url.clone(),
            default_base_url: provider
                .adapter
                .as_ref()
                .map(|a| a.default_base_url())
                .unwrap_or_default(),
            models: provider.customization.models.clone(),
            key_valid: match source {
                // A key saved without a failed test since counts as good.
                Some(KeySource::Settings) => provider.key_valid.or(Some(true)),
                Some(KeySource::Environment) => provider.key_valid,
                None => None,
            },
            default_models: provider
                .adapter
                .as_ref()
                .map(|a| a.models())
                .unwrap_or_default()
                .into_iter()
                .map(|m| ProviderModel {
                    id: m.id,
                    name: m.name,
                })
                .collect(),
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
        .route(
            "/settings/providers/{id}/customization",
            put(set_customization),
        )
        .route(
            "/settings/providers/{id}/models/fetch",
            post(fetch_provider_models),
        )
        .route("/settings/custom-providers", post(add_custom_provider))
        .route(
            "/settings/custom-providers/models",
            post(fetch_custom_models),
        )
        .route(
            "/settings/custom-providers/{id}",
            delete(remove_custom_provider),
        )
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
    for (id, provider) in &settings.snapshot() {
        out.push(settings.status(id, provider).await);
    }
    Json(out)
}

fn provider(state: &AppState, id: &str) -> Result<ProviderKey, ApiFailure> {
    state
        .settings
        .providers
        .read()
        .unwrap()
        .get(id)
        .cloned()
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
    record_key_result(&state, &id, Some(true)).await?;
    let provider = self::provider(&state, &id)?;
    Ok(Json(state.settings.status(&id, &provider).await))
}

async fn saved_key_results(pool: &sqlx::SqlitePool) -> BTreeMap<String, bool> {
    match db::get_setting(pool, KEY_RESULTS).await {
        Ok(Some(json)) => serde_json::from_str(&json).unwrap_or_else(|err| {
            tracing::warn!(%err, "ignoring saved key results");
            BTreeMap::new()
        }),
        Ok(None) => BTreeMap::new(),
        Err(err) => {
            tracing::warn!(%err, "cannot read key results");
            BTreeMap::new()
        }
    }
}

/// Keeps what is known about a provider's key, so showing it needs no request
/// to the provider. `None` forgets it.
async fn record_key_result(
    state: &AppState,
    id: &str,
    valid: Option<bool>,
) -> Result<(), ApiFailure> {
    let mut all = saved_key_results(&state.db).await;
    match valid {
        Some(valid) => all.insert(id.to_string(), valid),
        None => all.remove(id),
    };
    let json = serde_json::to_string(&all).map_err(|e| ApiFailure::internal(e.to_string()))?;
    db::set_setting(&state.db, KEY_RESULTS, &json)
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))?;
    if let Some(provider) = state.settings.providers.write().unwrap().get_mut(id) {
        provider.key_valid = valid;
    }
    Ok(())
}

/// How long a provider gets to answer a key test.
const KEY_TEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Asks the provider whether it accepts its current key, and keeps the outcome.
/// A rejection is a normal result here, not an API failure. A provider's error can quote what
/// it was sent, so the key is removed from the message before it is returned.
async fn test_key(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ProviderKeyTest>, ApiFailure> {
    let provider = provider(&state, &id)?;
    let failed = |message: String| ProviderKeyTest {
        ok: false,
        message: Some(message),
    };
    let Some(key) = current_key(&provider.handle) else {
        return Ok(Json(failed(format!(
            "{} has no API key to test",
            provider.name
        ))));
    };
    let outcome = tokio::time::timeout(KEY_TEST_TIMEOUT, state.agent.providers().test_key(&id));
    let result = match outcome.await {
        Ok(Ok(())) => ProviderKeyTest {
            ok: true,
            message: None,
        },
        Ok(Err(err)) => failed(err.to_string().replace(&key, &hint(&key))),
        Err(_) => failed(format!(
            "{} did not answer within {} seconds",
            provider.name,
            KEY_TEST_TIMEOUT.as_secs()
        )),
    };
    record_key_result(&state, &id, Some(result.ok)).await?;
    Ok(Json(result))
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
    record_key_result(&state, &id, None).await?;
    let provider = self::provider(&state, &id)?;
    Ok(Json(state.settings.status(&id, &provider).await))
}

async fn saved_customizations(pool: &sqlx::SqlitePool) -> BTreeMap<String, ProviderCustomization> {
    match db::get_setting(pool, CUSTOMIZATIONS).await {
        Ok(Some(json)) => serde_json::from_str(&json).unwrap_or_else(|err| {
            tracing::warn!(%err, "ignoring saved provider changes");
            BTreeMap::new()
        }),
        Ok(None) => BTreeMap::new(),
        Err(err) => {
            tracing::warn!(%err, "cannot read provider changes");
            BTreeMap::new()
        }
    }
}

async fn save_customizations(
    state: &AppState,
    all: &BTreeMap<String, ProviderCustomization>,
) -> Result<(), ApiFailure> {
    let json = serde_json::to_string(all).map_err(|e| ApiFailure::internal(e.to_string()))?;
    db::set_setting(&state.db, CUSTOMIZATIONS, &json)
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))
}

/// The blank-free model list, with each repeated id kept once. `None` when
/// nothing is left, which means the provider's own list.
fn clean_models(models: Option<Vec<ProviderModel>>) -> Option<Vec<ProviderModel>> {
    let mut seen = std::collections::HashSet::new();
    let models: Vec<ProviderModel> = models?
        .into_iter()
        .filter_map(|model| {
            let id = model.id.trim().to_string();
            if id.is_empty() || !seen.insert(id.clone()) {
                return None;
            }
            let name = model.name.trim();
            let name = if name.is_empty() {
                id.clone()
            } else {
                name.to_string()
            };
            Some(ProviderModel { id, name })
        })
        .collect();
    (!models.is_empty()).then_some(models)
}

/// Saves a provider's base URL and model list; sessions opened afterwards use
/// them.
async fn set_customization(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<ProviderCustomization>,
) -> Result<Json<ProviderKeyStatus>, ApiFailure> {
    let known = provider(&state, &id)?;
    let base_url = match body.base_url.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(url) => {
            Some(check_base_url(url).map_err(|e| ApiFailure::new(StatusCode::BAD_REQUEST, e))?)
        }
    };
    let customization = ProviderCustomization {
        base_url,
        models: clean_models(body.models),
    };
    let mut all = saved_customizations(&state.db).await;
    all.insert(id.clone(), customization.clone());
    save_customizations(&state, &all).await?;
    state
        .settings
        .apply_customization(&id, customization, state.agent.providers());
    if current_key(&known.handle).is_some() {
        record_key_result(&state, &id, Some(true)).await?;
    }
    let provider = provider(&state, &id)?;
    Ok(Json(state.settings.status(&id, &provider).await))
}

/// Asks a provider which models it serves, using what the form shows. A key
/// typed here is used for this one request and not stored.
async fn fetch_provider_models(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<FetchModelsRequest>,
) -> Result<Json<Vec<ProviderModel>>, ApiFailure> {
    let provider = provider(&state, &id)?;
    let bad = |message: String| ApiFailure::new(StatusCode::BAD_REQUEST, message);
    let adapter = provider
        .adapter
        .as_ref()
        .ok_or_else(|| bad(format!("{} cannot list its models", provider.name)))?;
    let key = body
        .key
        .as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(String::from)
        .or_else(|| current_key(&provider.handle))
        .ok_or_else(|| bad("enter an API key to fetch models".to_string()))?;
    let base_url = match body.base_url.as_deref().map(str::trim) {
        None | Some("") => adapter.default_base_url(),
        Some(url) => check_base_url(url).map_err(bad)?,
    };
    list_models(adapter.as_ref(), &base_url, &key, &provider.name).await
}

/// Asks a provider which models it serves. A provider's error can quote what it
/// was sent, so the key is removed from the message.
async fn list_models(
    adapter: &dyn CustomizableProvider,
    base_url: &str,
    key: &str,
    name: &str,
) -> Result<Json<Vec<ProviderModel>>, ApiFailure> {
    let request = fetch_models(adapter.models_request(base_url, key));
    match tokio::time::timeout(KEY_TEST_TIMEOUT, request).await {
        Ok(Ok(models)) => Ok(Json(models)),
        Ok(Err(err)) => Err(ApiFailure::new(
            StatusCode::BAD_GATEWAY,
            err.to_string().replace(key, &hint(key)),
        )),
        Err(_) => Err(ApiFailure::new(
            StatusCode::GATEWAY_TIMEOUT,
            format!(
                "{name} did not answer within {} seconds",
                KEY_TEST_TIMEOUT.as_secs()
            ),
        )),
    }
}

async fn saved_custom_providers(pool: &sqlx::SqlitePool) -> Vec<CustomProvider> {
    match db::get_setting(pool, CUSTOM_PROVIDERS).await {
        Ok(Some(json)) => serde_json::from_str(&json).unwrap_or_else(|err| {
            tracing::warn!(%err, "ignoring saved custom providers");
            Vec::new()
        }),
        Ok(None) => Vec::new(),
        Err(err) => {
            tracing::warn!(%err, "cannot read custom providers");
            Vec::new()
        }
    }
}

async fn save_custom_providers(
    state: &AppState,
    list: &[CustomProvider],
) -> Result<(), ApiFailure> {
    let json = serde_json::to_string(list).map_err(|e| ApiFailure::internal(e.to_string()))?;
    db::set_setting(&state.db, CUSTOM_PROVIDERS, &json)
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))
}

/// The adapter for a custom provider's protocol, and its key.
fn custom_adapter(custom: &CustomProvider) -> (Arc<dyn CustomizableProvider>, KeyHandle) {
    let (id, name, url, models) = (
        &custom.id,
        &custom.name,
        &custom.base_url,
        custom.models.as_slice(),
    );
    match custom.protocol {
        ApiProtocol::AnthropicMessages => {
            let adapter = AnthropicProvider::custom(id, name, url, models);
            let handle = adapter.key_handle();
            (Arc::new(adapter), handle)
        }
        protocol => {
            let responses = protocol == ApiProtocol::OpenaiResponses;
            let adapter = OpenAiCompatProvider::custom(id, name, url, responses, models);
            let handle = adapter.key_handle();
            (Arc::new(adapter), handle)
        }
    }
}

/// Whether `id` can name a provider: lowercase, starting with a letter. It is
/// fixed once chosen, because saved settings refer to it.
fn valid_custom_id(id: &str) -> bool {
    id.starts_with(|c: char| c.is_ascii_lowercase())
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Asks a custom provider that does not exist yet which models it serves, using
/// what the form shows. Nothing is stored.
async fn fetch_custom_models(
    Json(body): Json<FetchCustomModelsRequest>,
) -> Result<Json<Vec<ProviderModel>>, ApiFailure> {
    let bad = |message: String| ApiFailure::new(StatusCode::BAD_REQUEST, message);
    let base_url = check_base_url(&body.base_url).map_err(bad)?;
    let key = body.key.trim();
    if key.is_empty() {
        return Err(bad("enter an API key to fetch models".to_string()));
    }
    let (adapter, _) = custom_adapter(&CustomProvider {
        id: "draft".into(),
        name: "This provider".into(),
        base_url: base_url.clone(),
        protocol: body.protocol,
        models: Vec::new(),
    });
    list_models(adapter.as_ref(), &base_url, key, "This provider").await
}

/// Adds an API by its base URL and protocol. It is usable straight away and is
/// kept across restarts.
async fn add_custom_provider(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddCustomProviderRequest>,
) -> Result<Json<ProviderKeyStatus>, ApiFailure> {
    let bad = |message: String| ApiFailure::new(StatusCode::BAD_REQUEST, message);
    let id = body.id.trim().to_string();
    if !valid_custom_id(&id) {
        return Err(bad(
            "the provider ID must be lowercase and start with a letter".to_string(),
        ));
    }
    let name = body.name.trim();
    if name.is_empty() {
        return Err(bad("enter a display name".to_string()));
    }
    let base_url = check_base_url(&body.base_url).map_err(bad)?;
    let key = body.key.trim();
    if key.is_empty() {
        return Err(bad("enter an API key".to_string()));
    }
    let models = clean_models(Some(body.models))
        .ok_or_else(|| bad("enter at least one model id".to_string()))?;
    if state.settings.providers.read().unwrap().contains_key(&id) {
        return Err(ApiFailure::new(
            StatusCode::CONFLICT,
            format!("a provider with the ID {id} already exists"),
        ));
    }
    store(&state)?
        .set(&secret_name(&id), key)
        .await
        .map_err(ApiFailure::internal)?;
    let custom = CustomProvider {
        id: id.clone(),
        name: name.to_string(),
        base_url,
        protocol: body.protocol,
        models,
    };
    let mut list = saved_custom_providers(&state.db).await;
    list.push(custom.clone());
    save_custom_providers(&state, &list).await?;
    let handle = state
        .settings
        .register_custom(&custom, state.agent.providers());
    if let Ok(mut current) = handle.write() {
        *current = Some(key.to_string());
    }
    let provider = provider(&state, &id)?;
    Ok(Json(state.settings.status(&id, &provider).await))
}

/// Removes a provider the user added, with its key. A provider Forge ships
/// cannot be removed.
async fn remove_custom_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<()>, ApiFailure> {
    if !provider(&state, &id)?.custom {
        return Err(ApiFailure::new(
            StatusCode::BAD_REQUEST,
            format!("{id} is not a custom provider"),
        ));
    }
    let mut list = saved_custom_providers(&state.db).await;
    list.retain(|custom| custom.id != id);
    save_custom_providers(&state, &list).await?;
    store(&state)?
        .remove(&secret_name(&id))
        .await
        .map_err(ApiFailure::internal)?;
    let mut changes = saved_customizations(&state.db).await;
    if changes.remove(&id).is_some() {
        save_customizations(&state, &changes).await?;
    }
    record_key_result(&state, &id, None).await?;
    state.settings.providers.write().unwrap().remove(&id);
    state.agent.providers().remove(&id);
    Ok(Json(()))
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

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
                description: "Claude".into(),
                handle: handle.clone(),
                env: env.map(String::from),
                env_var: "ANTHROPIC_API_KEY".into(),
                custom: false,
                ..Default::default()
            },
        );
        let settings = Settings {
            secrets: Some(SecretStore::open(pool, &dir.join("secret.key")).unwrap()),
            providers: Arc::new(RwLock::new(providers)),
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
                description: "Claude".into(),
                handle: anthropic.key_handle(),
                env: None,
                env_var: "ANTHROPIC_API_KEY".into(),
                custom: false,
                ..Default::default()
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
                providers: Arc::new(RwLock::new(keys)),
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

    /// The settings API with a database and key store that outlive it, to test
    /// a restart.
    async fn start_custom(dir: &std::path::Path) -> (String, Arc<AppState>) {
        let pool = db::connect(dir.join("forge.db").to_str().unwrap())
            .await
            .unwrap();
        let settings = Settings {
            secrets: Some(SecretStore::open(pool.clone(), &dir.join("secret.key")).unwrap()),
            ..Default::default()
        };
        let providers = Providers::new();
        settings.load_custom(&pool, &providers).await;
        settings.load_customizations(&pool, &providers).await;
        settings.load_key_results(&pool).await;
        settings.load().await;
        let events = EventService::new();
        let state = Arc::new(AppState {
            db: pool,
            agent: Agent::with_providers(providers, events.clone()),
            events,
            terminals: Default::default(),
            settings,
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .nest("/api", router())
            .with_state(state.clone());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}/api/settings"), state)
    }

    fn custom_body() -> Value {
        json!({
            "id": "my-gateway",
            "name": "My Gateway",
            "base_url": "https://gw.example.com/v1/",
            "protocol": "openai_chat",
            "key": "  gw-secret-5678  ",
            "models": [
                { "id": " model-a ", "name": "" },
                { "id": "", "name": "" },
                { "id": "model-b", "name": "Model B" },
            ],
        })
    }

    #[tokio::test]
    async fn a_custom_provider_is_usable_at_once_and_survives_a_restart() {
        let dir = temp();
        let (api, state) = start_custom(&dir).await;

        let (status, body) = call(
            reqwest::Method::POST,
            &format!("{api}/custom-providers"),
            Some(custom_body()),
        )
        .await;

        assert_eq!(status, 200, "{body}");
        assert!(!body.contains("secret"), "{body}");
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(
            body,
            json!({
                "provider": "my-gateway",
                "name": "My Gateway",
                "description": "https://gw.example.com/v1",
                "hint": "…5678",
                "source": "settings",
                "env_var": "",
                "custom": true,
                "base_url": null,
                "default_base_url": "https://gw.example.com/v1",
                "models": null,
                "default_models": [
                    { "id": "model-a", "name": "model-a" },
                    { "id": "model-b", "name": "Model B" },
                ],
                "key_valid": true,
            })
        );
        let catalog = state.agent.providers().catalog();
        assert_eq!(catalog.providers[0].id, "my-gateway");
        let models: Vec<_> = catalog.providers[0].models.iter().map(|m| &m.id).collect();
        assert_eq!(models, ["model-a", "model-b"]);

        let (_, restarted) = start_custom(&dir).await;

        let catalog = restarted.agent.providers().catalog();
        assert_eq!(catalog.providers[0].name, "My Gateway");
        assert!(catalog.default.is_some(), "its key came back too");
    }

    #[tokio::test]
    async fn a_custom_provider_can_be_removed_with_its_key() {
        let dir = temp();
        let (api, state) = start_custom(&dir).await;
        call(
            reqwest::Method::POST,
            &format!("{api}/custom-providers"),
            Some(custom_body()),
        )
        .await;

        let (status, _) = call(
            reqwest::Method::DELETE,
            &format!("{api}/custom-providers/my-gateway"),
            None,
        )
        .await;

        assert_eq!(status, 200);
        assert!(state.agent.providers().catalog().providers.is_empty());
        let (_, listed) = call(reqwest::Method::GET, &format!("{api}/providers"), None).await;
        assert_eq!(listed, "[]");
        let secret = state.settings.secrets.as_ref().unwrap();
        assert_eq!(secret.get("provider-key:my-gateway").await.unwrap(), None);
        let (_, restarted) = start_custom(&dir).await;
        assert!(restarted.agent.providers().catalog().providers.is_empty());
    }

    #[tokio::test]
    async fn a_custom_provider_with_bad_details_is_refused() {
        let dir = temp();
        let (api, state) = start_custom(&dir).await;
        let url = format!("{api}/custom-providers");
        for (field, value, expected) in [
            ("id", json!("Bad ID"), 400),
            ("id", json!("1abc"), 400),
            ("name", json!("   "), 400),
            ("base_url", json!("http://gw.example.com/v1"), 400),
            ("base_url", json!("nonsense"), 400),
            ("key", json!("   "), 400),
            ("models", json!([{ "id": "  ", "name": "" }]), 400),
        ] {
            let mut body = custom_body();
            body[field] = value;
            let (status, text) = call(reqwest::Method::POST, &url, Some(body)).await;
            assert_eq!(status, expected, "{field}: {text}");
        }
        assert!(state.agent.providers().list().is_empty());

        call(reqwest::Method::POST, &url, Some(custom_body())).await;
        let (status, _) = call(reqwest::Method::POST, &url, Some(custom_body())).await;
        assert_eq!(status, 409, "a second provider with the same name");
    }

    /// Adds a custom provider and returns the base of its settings API.
    async fn with_custom(api: &str) -> String {
        call(
            reqwest::Method::POST,
            &format!("{api}/custom-providers"),
            Some(custom_body()),
        )
        .await;
        format!("{api}/providers/my-gateway")
    }

    #[tokio::test]
    async fn changed_models_and_base_url_apply_at_once_and_survive_a_restart() {
        let dir = temp();
        let (api, state) = start_custom(&dir).await;
        let provider = with_custom(&api).await;

        let (status, body) = call(
            reqwest::Method::PUT,
            &format!("{provider}/customization"),
            Some(json!({
                "base_url": " https://other.example.com/v2/ ",
                "models": [
                    { "id": " new-1 ", "name": " New One " },
                    { "id": "new-2", "name": "" },
                    { "id": "new-1", "name": "repeat" },
                    { "id": "  ", "name": "blank" },
                ],
            })),
        )
        .await;

        assert_eq!(status, 200, "{body}");
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(body["base_url"], "https://other.example.com/v2");
        assert_eq!(body["default_base_url"], "https://gw.example.com/v1");
        let expected = json!([
            { "id": "new-1", "name": "New One" },
            { "id": "new-2", "name": "new-2" },
        ]);
        assert_eq!(body["models"], expected);
        assert_eq!(body["hint"], "…5678", "the key is untouched");
        let listed = |state: &AppState| -> Vec<String> {
            state.agent.providers().catalog().providers[0]
                .models
                .iter()
                .map(|m| m.id.clone())
                .collect()
        };
        assert_eq!(listed(&state), ["new-1", "new-2"]);

        let (restarted_api, restarted) = start_custom(&dir).await;
        assert_eq!(listed(&restarted), ["new-1", "new-2"]);

        // Clearing the changes brings back the provider's own settings.
        call(
            reqwest::Method::PUT,
            &format!("{restarted_api}/providers/my-gateway/customization"),
            Some(json!({ "base_url": "", "models": null })),
        )
        .await;
        assert_eq!(listed(&restarted), ["model-a", "model-b"]);
    }

    #[tokio::test]
    async fn a_base_url_that_would_expose_the_key_is_refused() {
        let dir = temp();
        let (api, _state) = start_custom(&dir).await;
        let provider = with_custom(&api).await;
        let (status, _) = call(
            reqwest::Method::PUT,
            &format!("{provider}/customization"),
            Some(json!({ "base_url": "http://other.example.com", "models": null })),
        )
        .await;
        assert_eq!(status, 400);
    }

    /// A stand-in for a provider's model list that records the auth header.
    async fn fake_models(status: u16, body: &'static str) -> (String, Arc<Mutex<Vec<String>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let recorded = seen.clone();
        let app = Router::new().route(
            "/v1/models",
            get(move |headers: axum::http::HeaderMap| {
                let recorded = recorded.clone();
                async move {
                    recorded
                        .lock()
                        .unwrap()
                        .push(headers["authorization"].to_str().unwrap().to_string());
                    (StatusCode::from_u16(status).unwrap(), body)
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}/v1"), seen)
    }

    #[tokio::test]
    async fn fetching_models_uses_the_form_and_stores_nothing() {
        let listing = r#"{"data":[{"id":"a"},{"id":"b","name":"Bee"},{"id":"c","display_name":"Sea"},{"nope":1}]}"#;
        let (url, seen) = fake_models(200, listing).await;
        let dir = temp();
        let (api, state) = start_custom(&dir).await;
        let provider = with_custom(&api).await;

        let (status, body) = call(
            reqwest::Method::POST,
            &format!("{provider}/models/fetch"),
            Some(json!({ "base_url": url, "key": "draft-key" })),
        )
        .await;

        assert_eq!(status, 200, "{body}");
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(
            body,
            json!([
                { "id": "a", "name": "a" },
                { "id": "b", "name": "Bee" },
                { "id": "c", "name": "Sea" },
            ])
        );
        assert_eq!(seen.lock().unwrap()[0], "Bearer draft-key");
        // Neither the typed key nor the typed URL was kept.
        let (_, listed) = call(reqwest::Method::GET, &format!("{api}/providers"), None).await;
        assert!(
            listed.contains("…5678") && !listed.contains("draft"),
            "{listed}"
        );
        assert_eq!(
            state.agent.providers().catalog().providers[0].models.len(),
            2
        );

        // With no key typed it falls back to the saved one.
        call(
            reqwest::Method::POST,
            &format!("{provider}/models/fetch"),
            Some(json!({ "base_url": url, "key": "" })),
        )
        .await;
        assert_eq!(seen.lock().unwrap()[1], "Bearer gw-secret-5678");
    }

    #[tokio::test]
    async fn a_failed_fetch_gives_the_reason_without_the_key() {
        let (url, _) = fake_models(401, r#"{"error":{"message":"bad key draft-key"}}"#).await;
        let dir = temp();
        let (api, _state) = start_custom(&dir).await;
        let provider = with_custom(&api).await;

        let (status, body) = call(
            reqwest::Method::POST,
            &format!("{provider}/models/fetch"),
            Some(json!({ "base_url": url, "key": "draft-key" })),
        )
        .await;

        assert_eq!(status, 502);
        assert!(
            body.contains("bad key") && !body.contains("draft-key"),
            "{body}"
        );
    }

    #[tokio::test]
    async fn removing_a_custom_provider_forgets_its_changes() {
        let dir = temp();
        let (api, _state) = start_custom(&dir).await;
        let provider = with_custom(&api).await;
        call(
            reqwest::Method::PUT,
            &format!("{provider}/customization"),
            Some(json!({ "base_url": null, "models": [{ "id": "x", "name": "x" }] })),
        )
        .await;
        call(
            reqwest::Method::DELETE,
            &format!("{api}/custom-providers/my-gateway"),
            None,
        )
        .await;
        let with_again = with_custom(&api).await;
        let (_, listed) = call(reqwest::Method::GET, &format!("{api}/providers"), None).await;
        assert!(
            listed.contains("model-a") && !listed.contains("\"x\""),
            "{listed}"
        );
        drop(with_again);
    }

    #[tokio::test]
    async fn a_custom_provider_keeps_its_protocol_across_a_restart() {
        let (url, seen) = fake_api(200, "").await;
        let dir = temp();
        let (api, _state) = start_custom(&dir).await;
        let mut body = custom_body();
        body["protocol"] = json!("anthropic_messages");
        body["base_url"] = json!(format!("{url}/v1"));
        let (status, text) = call(
            reqwest::Method::POST,
            &format!("{api}/custom-providers"),
            Some(body),
        )
        .await;
        assert_eq!(status, 200, "{text}");

        let (restarted_api, _restarted) = start_custom(&dir).await;

        let (_, tested) = call(
            reqwest::Method::POST,
            &format!("{restarted_api}/providers/my-gateway/key/test"),
            None,
        )
        .await;
        assert!(tested.contains("\"ok\":true"), "{tested}");
        let seen = seen.lock().unwrap();
        assert_eq!(seen[0]["model"], "model-a");
        assert!(
            seen[0].get("fallbacks").is_none(),
            "only Anthropic takes this"
        );
    }

    /// What the settings API says about a provider's key.
    async fn key_valid(api: &str, id: &str) -> Value {
        let (_, list) = call(reqwest::Method::GET, &format!("{api}/providers"), None).await;
        let list: Value = serde_json::from_str(&list).unwrap();
        list.as_array()
            .unwrap()
            .iter()
            .find(|p| p["provider"] == id)
            .unwrap()["key_valid"]
            .clone()
    }

    #[tokio::test]
    async fn a_key_result_survives_a_restart_and_a_save_turns_it_good() {
        let (url, seen) = fake_api(401, r#"{"error":{"message":"bad key"}}"#).await;
        let dir = temp();
        let (api, _state) = start_custom(&dir).await;
        let mut body = custom_body();
        body["protocol"] = json!("anthropic_messages");
        body["base_url"] = json!(format!("{url}/v1"));
        call(
            reqwest::Method::POST,
            &format!("{api}/custom-providers"),
            Some(body),
        )
        .await;
        assert_eq!(key_valid(&api, "my-gateway").await, json!(true));
        assert!(seen.lock().unwrap().is_empty(), "saving makes no request");

        let test = format!("{api}/providers/my-gateway/key/test");
        let (_, tested) = call(reqwest::Method::POST, &test, None).await;
        assert!(tested.contains("\"ok\":false"), "{tested}");
        assert_eq!(key_valid(&api, "my-gateway").await, json!(false));

        let (api, _restarted) = start_custom(&dir).await;
        assert_eq!(key_valid(&api, "my-gateway").await, json!(false));
        assert_eq!(seen.lock().unwrap().len(), 1, "listing makes no request");

        let (status, saved) = call(
            reqwest::Method::PUT,
            &format!("{api}/providers/my-gateway/customization"),
            Some(json!({ "base_url": null, "models": null })),
        )
        .await;
        assert_eq!(status, 200, "{saved}");
        assert_eq!(key_valid(&api, "my-gateway").await, json!(true));

        call(
            reqwest::Method::POST,
            &format!("{api}/providers/my-gateway/key/test"),
            None,
        )
        .await;
        assert_eq!(key_valid(&api, "my-gateway").await, json!(false));
        let (status, saved) = call(
            reqwest::Method::PUT,
            &format!("{api}/providers/my-gateway/key"),
            Some(json!({ "key": "sk-new" })),
        )
        .await;
        assert_eq!(status, 200, "{saved}");
        assert_eq!(key_valid(&api, "my-gateway").await, json!(true));
    }

    #[tokio::test]
    async fn an_environment_key_is_unknown_until_tested_and_no_key_has_no_result() {
        let dir = temp();
        let (api, state) = start_custom(&dir).await;
        let provider = |env: Option<&str>| ProviderKey {
            env: env.map(String::from),
            ..Default::default()
        };
        {
            let mut all = state.settings.providers.write().unwrap();
            all.insert("from-env".into(), provider(Some("sk-env")));
            all.insert("no-key".into(), provider(None));
        }
        assert_eq!(key_valid(&api, "from-env").await, Value::Null);
        assert_eq!(key_valid(&api, "no-key").await, Value::Null);
    }

    #[tokio::test]
    async fn models_can_be_fetched_before_a_custom_provider_exists() {
        let (url, seen) = fake_models(200, r#"{"data":[{"id":"a"}]}"#).await;
        let dir = temp();
        let (api, state) = start_custom(&dir).await;
        let fetch = format!("{api}/custom-providers/models");

        let (status, body) = call(
            reqwest::Method::POST,
            &fetch,
            Some(json!({ "base_url": url, "protocol": "openai_responses", "key": "draft-key" })),
        )
        .await;

        assert_eq!(status, 200, "{body}");
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(body, json!([{ "id": "a", "name": "a" }]));
        assert_eq!(seen.lock().unwrap()[0], "Bearer draft-key");
        assert!(
            state.agent.providers().list().is_empty(),
            "nothing was added"
        );

        for (base_url, key) in [(url.as_str(), " "), ("http://gw.example.com", "k")] {
            let (status, _) = call(
                reqwest::Method::POST,
                &fetch,
                Some(json!({ "base_url": base_url, "protocol": "openai_chat", "key": key })),
            )
            .await;
            assert_eq!(status, 400);
        }
    }

    #[tokio::test]
    async fn a_shipped_provider_cannot_be_removed_as_custom() {
        let dir = temp();
        let (settings, _) = settings(&dir, None).await;
        let api = start(settings).await;
        let root = api.trim_end_matches("/providers");
        let (status, _) = call(
            reqwest::Method::DELETE,
            &format!("{root}/custom-providers/anthropic"),
            None,
        )
        .await;
        assert_eq!(status, 400);
        let (status, _) = call(
            reqwest::Method::DELETE,
            &format!("{root}/custom-providers/nope"),
            None,
        )
        .await;
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
            json!({ "provider": "anthropic", "name": "Anthropic", "description": "Claude", "hint": "…9876", "source": "settings", "env_var": "ANTHROPIC_API_KEY", "custom": false, "base_url": null, "default_base_url": "", "models": null, "default_models": [], "key_valid": true })
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
