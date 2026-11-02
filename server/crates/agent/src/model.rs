//! The provider-neutral model interface the agent loop talks to (PRD §6.1
//! Models: providers plug in through adapters).

use serde::Serialize;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::tools::ToolSpec;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

/// One block of a message. Thinking blocks are kept so they can be sent
/// back unchanged with the tool results that follow them.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    Thinking {
        thinking: String,
        signature: String,
    },
    RedactedThinking {
        data: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: Vec<ContentBlock>,
}

impl ChatMessage {
    pub fn user(content: Vec<ContentBlock>) -> Self {
        Self {
            role: Role::User,
            content,
        }
    }

    pub fn assistant(content: Vec<ContentBlock>) -> Self {
        Self {
            role: Role::Assistant,
            content,
        }
    }

    pub fn user_text(text: impl Into<String>) -> Self {
        Self::user(vec![ContentBlock::Text { text: text.into() }])
    }

    pub fn assistant_text(text: impl Into<String>) -> Self {
        Self::assistant(vec![ContentBlock::Text { text: text.into() }])
    }
}

#[derive(Debug, Clone)]
pub struct ModelRequest {
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolSpec>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ModelEvent {
    /// A piece of the assistant's reply, forwarded as soon as it arrives.
    TextDelta(String),
    /// The complete assistant message, sent once at the end of the reply.
    /// A provider that never sends it is treated as replying with the text
    /// deltas alone.
    Message(Vec<ContentBlock>),
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
