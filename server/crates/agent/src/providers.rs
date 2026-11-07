//! Model provider adapters (PRD §6.1 Models and reasoning effort). Each
//! provider lists its models and builds a [`ModelClient`] for one of them;
//! the agent loop only ever talks to the client, so adding a provider means
//! registering an adapter here and nothing else.

use std::sync::Arc;

use api_types::{ModelCatalog, ModelOption, ProviderOption, ReasoningEffort, SessionModel};
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

/// The registered providers, in the order they were registered; the first
/// configured one is the default, and with none configured there is no
/// default.
#[derive(Clone, Default)]
pub struct Providers {
    list: Vec<Arc<dyn ModelProvider>>,
}

impl Providers {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds `provider`, replacing one registered with the same id.
    pub fn register(&mut self, provider: Arc<dyn ModelProvider>) {
        match self.list.iter_mut().find(|p| p.id() == provider.id()) {
            Some(slot) => *slot = provider,
            None => self.list.push(provider),
        }
    }

    pub fn list(&self) -> &[Arc<dyn ModelProvider>] {
        &self.list
    }

    pub fn get(&self, id: &str) -> Option<&Arc<dyn ModelProvider>> {
        self.list.iter().find(|p| p.id() == id)
    }

    /// The providers a session can start with.
    fn configured(&self) -> impl Iterator<Item = &Arc<dyn ModelProvider>> {
        self.list.iter().filter(|p| p.is_configured())
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
        }]
    }
    fn client(&self, _: &str) -> Arc<dyn ModelClient> {
        self.0.clone()
    }
}
