//! Model provider adapters (PRD §6.1 Models and reasoning effort). Each
//! provider lists its models and builds a [`ModelClient`] for one of them;
//! the agent loop only ever talks to the client, so adding a provider means
//! registering an adapter here and nothing else.

use std::sync::{Arc, RwLock};

use api_types::{
    ModelCatalog, ModelOption, ProviderModel, ProviderOption, ReasoningEffort, SessionModel,
};
use serde::{Deserialize, Serialize};

use crate::model::{ChatMessage, ModelClient, ModelError, ModelRequest};

/// The API key a provider uses, shared so Settings can change it while the
/// server runs; clients read the current value for every request.
pub type KeyHandle = Arc<std::sync::RwLock<Option<String>>>;

/// The non-blank key in `handle`, if any.
pub fn current_key(handle: &KeyHandle) -> Option<String> {
    handle
        .read()
        .ok()
        .and_then(|key| key.clone())
        .filter(|key| !key.trim().is_empty())
}

/// A model a provider offers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    /// The efforts this model accepts; empty when it has no effort setting.
    pub efforts: Vec<ReasoningEffort>,
    /// How many tokens its context holds; `None` when unknown.
    pub context_window: Option<u64>,
}

impl ModelInfo {
    /// The effort to use for this model when `wanted` may not be one it
    /// offers: `wanted` if offered, else the usual default, else its first.
    pub fn fit_effort(&self, wanted: ReasoningEffort) -> ReasoningEffort {
        let usual = ReasoningEffort::default();
        if self.efforts.contains(&wanted) || self.efforts.is_empty() {
            wanted
        } else if self.efforts.contains(&usual) {
            usual
        } else {
            self.efforts[0]
        }
    }
}

/// Which provider and model a session talks to, and how hard it thinks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelChoice {
    pub provider: String,
    pub model: String,
    /// The provider's default effort when `None`.
    #[serde(default)]
    pub effort: Option<ReasoningEffort>,
}

impl From<&SessionModel> for ModelChoice {
    fn from(m: &SessionModel) -> Self {
        Self {
            provider: m.provider.clone(),
            model: m.model.clone(),
            effort: Some(m.effort),
        }
    }
}

pub trait ModelProvider: Send + Sync {
    /// A stable id, such as `anthropic`.
    fn id(&self) -> &str;
    /// The name shown to the user.
    fn name(&self) -> &str;
    /// The models offered, the default first.
    fn models(&self) -> Vec<ModelInfo>;
    /// A client for `model`, one of [`ModelProvider::models`].
    fn client(&self, model: &str) -> Arc<dyn ModelClient>;
    /// Whether the user has configured this provider, such as by adding its
    /// API key. Only configured providers can start a session.
    fn is_configured(&self) -> bool {
        true
    }
}

/// How to ask a provider which models it serves.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelListRequest {
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
}

/// A provider whose base URL and model list the user can change.
pub trait CustomizableProvider: ModelProvider {
    fn default_base_url(&self) -> String;
    /// A copy with these changes, sharing this provider's key.
    fn customized(
        &self,
        base_url: Option<&str>,
        models: Option<&[ProviderModel]>,
    ) -> Arc<dyn ModelProvider>;
    fn models_request(&self, base_url: &str, key: &str) -> ModelListRequest;
}

/// `picks` as this provider's models: one it already knows keeps its effort
/// options, and Forge assumes nothing about any other.
pub fn fit_models(known: &[ModelInfo], picks: &[ProviderModel]) -> Vec<ModelInfo> {
    picks
        .iter()
        .map(|pick| ModelInfo {
            id: pick.id.clone(),
            name: pick.name.clone(),
            efforts: known
                .iter()
                .find(|m| m.id == pick.id)
                .map(|m| m.efforts.clone())
                .unwrap_or_default(),
            context_window: pick.context_window.or_else(|| {
                known
                    .iter()
                    .find(|m| m.id == pick.id)
                    .and_then(|m| m.context_window)
            }),
        })
        .collect()
}

/// Asks a provider which models it serves.
pub async fn fetch_models(request: ModelListRequest) -> Result<Vec<ProviderModel>, ModelError> {
    let mut call = reqwest::Client::new().get(&request.url);
    for (name, value) in &request.headers {
        call = call.header(*name, value);
    }
    let response = call
        .send()
        .await
        .map_err(|e| ModelError::Request(e.to_string()))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| ModelError::Request(e.to_string()))?;
    let parsed: Option<serde_json::Value> = serde_json::from_str(&body).ok();
    if !status.is_success() {
        return Err(ModelError::Api {
            status: status.as_u16(),
            message: parsed
                .as_ref()
                .and_then(crate::openai_compat::error_message)
                .unwrap_or(body),
        });
    }
    let parsed = parsed.ok_or_else(|| ModelError::Request("not a model list".to_string()))?;
    let listed = parsed["data"]
        .as_array()
        .ok_or_else(|| ModelError::Request("not a model list".to_string()))?;
    Ok(listed
        .iter()
        .filter_map(|model| {
            let id = model["id"].as_str()?;
            // Google lists "models/gemini-x", but its chat endpoint takes "gemini-x".
            let id = id.strip_prefix("models/").unwrap_or(id);
            let name = model["display_name"]
                .as_str()
                .or(model["name"].as_str())
                .unwrap_or(id);
            // Lists name the context length differently.
            let context_window = ["context_length", "context_window", "inputTokenLimit"]
                .iter()
                .find_map(|key| model[*key].as_u64());
            Some(ProviderModel {
                id: id.to_string(),
                name: name.to_string(),
                context_window,
            })
        })
        .collect())
}

/// The registered providers, in the order they were registered; the first
/// configured one is the default, and with none configured there is no
/// default.
#[derive(Clone, Default)]
pub struct Providers {
    // Shared and locked because a custom provider can be added while the
    // server runs.
    list: Arc<RwLock<Vec<Arc<dyn ModelProvider>>>>,
}

impl Providers {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds `provider`, replacing one registered with the same id.
    pub fn register(&mut self, provider: Arc<dyn ModelProvider>) {
        self.add(provider);
    }

    /// Like [`Providers::register`], while the server runs.
    pub fn add(&self, provider: Arc<dyn ModelProvider>) {
        let mut list = self.list.write().unwrap();
        match list.iter_mut().find(|p| p.id() == provider.id()) {
            Some(slot) => *slot = provider,
            None => list.push(provider),
        }
    }

    /// Forgets a provider. Sessions already open keep their client.
    pub fn remove(&self, id: &str) {
        self.list.write().unwrap().retain(|p| p.id() != id);
    }

    pub fn list(&self) -> Vec<Arc<dyn ModelProvider>> {
        self.list.read().unwrap().clone()
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn ModelProvider>> {
        self.list().into_iter().find(|p| p.id() == id)
    }

    /// The providers a session can start with.
    fn configured(&self) -> impl Iterator<Item = Arc<dyn ModelProvider>> {
        self.list().into_iter().filter(|p| p.is_configured())
    }

    /// The first configured provider's first model.
    pub fn default_choice(&self) -> Option<ModelChoice> {
        self.configured().find_map(|p| {
            p.models().into_iter().next().map(|m| ModelChoice {
                provider: p.id().to_string(),
                model: m.id,
                effort: None,
            })
        })
    }

    /// Whether a new session can start with `choice`: it must exist, and its
    /// provider must be configured.
    pub fn check_usable(&self, choice: &ModelChoice) -> Result<(), ModelError> {
        self.resolve(choice)?;
        match self.get(&choice.provider) {
            Some(provider) if !provider.is_configured() => Err(ModelError::MissingApiKey {
                provider: provider.name().to_string(),
            }),
            _ => Ok(()),
        }
    }

    fn model_info(&self, provider: &str, model: &str) -> Option<ModelInfo> {
        self.get(provider)?
            .models()
            .into_iter()
            .find(|m| m.id == model)
    }

    /// The effort to send for `choice`: none when its model does not offer
    /// it, as a session saved before the model's options changed can ask for.
    pub fn effort_for(&self, choice: &ModelChoice) -> Option<ReasoningEffort> {
        let effort = choice.effort?;
        match self.model_info(&choice.provider, &choice.model) {
            Some(model) if !model.efforts.contains(&effort) => None,
            _ => Some(effort),
        }
    }

    /// `model` with its effort moved to one its model offers.
    pub fn fit_session_model(&self, model: SessionModel) -> SessionModel {
        let effort = self
            .model_info(&model.provider, &model.model)
            .map_or(model.effort, |info| info.fit_effort(model.effort));
        SessionModel { effort, ..model }
    }

    /// Checks a provider's key with the smallest real request its first model
    /// accepts, since only a call that needs the key can show it works. Goes
    /// through the adapter, so every provider gets this without extra code.
    pub async fn test_key(&self, id: &str) -> Result<(), ModelError> {
        let provider = self
            .get(id)
            .ok_or_else(|| ModelError::UnknownProvider(id.to_string()))?;
        let model = provider
            .models()
            .into_iter()
            .next()
            .ok_or(ModelError::NoProvider)?;
        let mut replies = provider.client(&model.id).stream(ModelRequest {
            messages: vec![ChatMessage::user_text("Hi")],
            tools: Vec::new(),
            system: None,
            effort: None,
            max_tokens: Some(1),
        });
        while let Some(reply) = replies.recv().await {
            reply?;
        }
        Ok(())
    }

    /// What a new session can pick from: configured providers only. The
    /// default uses the default effort.
    pub fn catalog(&self) -> ModelCatalog {
        ModelCatalog {
            providers: self
                .configured()
                .map(|p| ProviderOption {
                    id: p.id().to_string(),
                    name: p.name().to_string(),
                    models: p
                        .models()
                        .into_iter()
                        .map(|m| ModelOption {
                            id: m.id,
                            name: m.name,
                            efforts: m.efforts,
                        })
                        .collect(),
                })
                .collect(),
            default: self.default_choice().map(|c| {
                self.fit_session_model(SessionModel {
                    provider: c.provider,
                    model: c.model,
                    effort: ReasoningEffort::default(),
                })
            }),
        }
    }

    pub fn resolve(&self, choice: &ModelChoice) -> Result<Arc<dyn ModelClient>, ModelError> {
        let provider = self
            .get(&choice.provider)
            .ok_or_else(|| ModelError::UnknownProvider(choice.provider.clone()))?;
        if !provider.models().iter().any(|m| m.id == choice.model) {
            return Err(ModelError::UnknownModel {
                provider: choice.provider.clone(),
                model: choice.model.clone(),
            });
        }
        Ok(provider.client(&choice.model))
    }
}

/// A provider with one fixed client, for wiring a single client in.
pub(crate) struct FixedProvider(pub Arc<dyn ModelClient>);

impl ModelProvider for FixedProvider {
    fn id(&self) -> &str {
        "default"
    }
    fn name(&self) -> &str {
        "Default"
    }
    fn models(&self) -> Vec<ModelInfo> {
        vec![ModelInfo {
            id: "default".into(),
            name: "Default".into(),
            efforts: ReasoningEffort::ALL.to_vec(),
            context_window: None,
        }]
    }
    fn client(&self, _: &str) -> Arc<dyn ModelClient> {
        self.0.clone()
    }
}
