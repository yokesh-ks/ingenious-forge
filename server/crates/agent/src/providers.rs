//! Model provider adapters (PRD §6.1 Models and reasoning effort). Each
//! provider lists its models and builds a [`ModelClient`] for one of them;
//! the agent loop only ever talks to the client, so adding a provider means
//! registering an adapter here and nothing else.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::model::{ModelClient, ModelError};

/// A model a provider offers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

/// Which provider and model a session talks to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelChoice {
    pub provider: String,
    pub model: String,
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
}

/// The registered providers, in the order they were registered; the first
/// is the default.
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

    /// The first provider's first model.
    pub fn default_choice(&self) -> Option<ModelChoice> {
        self.list.iter().find_map(|p| {
            p.models().into_iter().next().map(|m| ModelChoice {
                provider: p.id().to_string(),
                model: m.id,
            })
        })
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
        }]
    }
    fn client(&self, _: &str) -> Arc<dyn ModelClient> {
        self.0.clone()
    }
}
