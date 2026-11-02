//! The provider-neutral model interface the agent loop talks to (PRD §6.1
//! Models: providers plug in through adapters).

use serde::Serialize;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ModelRequest {
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelEvent {
    /// A piece of the assistant's reply, forwarded as soon as it arrives.
    TextDelta(String),
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ModelError {
    #[error("ANTHROPIC_API_KEY is not set; add a model provider key to start a turn")]
    MissingApiKey,
    #[error("model request failed: {0}")]
    Request(String),
    #[error("model API returned {status}: {message}")]
    Api { status: u16, message: String },
    #[error("model stream error: {0}")]
    Stream(String),
    #[error("the model declined to respond")]
    Refusal,
}

/// A model provider. `stream` returns at once; events arrive on the
/// receiver as the provider emits them and the channel closes when the
/// reply is complete.
pub trait ModelClient: Send + Sync {
    fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>>;
}
