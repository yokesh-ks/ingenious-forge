//! The Forge Agent: runs turns against a model provider and publishes
//! what happens as session events (PRD §6.1 Agent loop).

pub mod anthropic;
pub mod model;
mod sse;
pub mod tools;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use api_types::SessionEvent;
use services::EventService;

use model::{ChatMessage, ContentBlock, ModelClient, ModelEvent, ModelRequest};
use tools::ToolBox;

/// Model calls allowed in one turn before the agent gives up, so a model
/// that keeps calling tools cannot run forever.
const MAX_STEPS: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AgentError {
    #[error("message is empty")]
    EmptyMessage,
    #[error("a turn is already running in this session")]
    TurnInProgress,
}

#[derive(Default)]
struct SessionState {
    history: Vec<ChatMessage>,
    running: bool,
}

#[derive(Clone)]
pub struct Agent {
    model: Arc<dyn ModelClient>,
    events: EventService,
    tools: ToolBox,
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
}

impl Agent {
    pub fn new(model: Arc<dyn ModelClient>, events: EventService, tools: ToolBox) -> Self {
        Self {
            model,
            events,
            tools,
            sessions: Arc::default(),
        }
    }

    /// Starts a turn for `text` in `session_id` and returns at once; the
    /// reply arrives as session events. One turn runs per session at a time.
    pub fn send_message(&self, session_id: &str, text: &str) -> Result<(), AgentError> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AgentError::EmptyMessage);
        }
        let conversation = {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions.entry(session_id.to_string()).or_default();
            if session.running {
                return Err(AgentError::TurnInProgress);
            }
            session.running = true;
            let mut messages = session.history.clone();
            messages.push(ChatMessage::user_text(text));
            messages
        };
        let agent = self.clone();
        let session_id = session_id.to_string();
        tokio::spawn(async move { agent.run_turn(session_id, conversation).await });
        Ok(())
    }

    async fn run_turn(self, session_id: String, mut conversation: Vec<ChatMessage>) {
        self.events.publish(SessionEvent::TurnStarted {
            session_id: session_id.clone(),
        });
        let result = self.run_steps(&session_id, &mut conversation).await;

        {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions.entry(session_id.clone()).or_default();
            session.running = false;
            // Only a completed exchange joins the history, so a retry after
            // a failure does not replay the failed prompt.
            if result.is_ok() {
                session.history = conversation;
            }
        }

        self.events.publish(match result {
            Ok(()) => SessionEvent::Done { session_id },
            Err(message) => SessionEvent::Error {
                session_id,
                message,
            },
        });
    }

    /// Calls the model, runs the tools it asks for and feeds their results
    /// back until it replies without a tool call.
    async fn run_steps(
        &self,
        session_id: &str,
        conversation: &mut Vec<ChatMessage>,
    ) -> Result<(), String> {
        for _ in 0..MAX_STEPS {
            let reply = self.model_step(session_id, conversation).await?;
            let calls: Vec<_> = reply
                .iter()
                .filter_map(|block| match block {
                    ContentBlock::ToolUse { id, name, input } => {
                        Some((id.clone(), name.clone(), input.clone()))
                    }
                    _ => None,
                })
                .collect();
            if !reply.is_empty() {
                conversation.push(ChatMessage::assistant(reply));
            }
            if calls.is_empty() {
                return Ok(());
            }
            let mut results = Vec::with_capacity(calls.len());
            for (call_id, name, input) in calls {
                results.push(self.run_tool(session_id, call_id, name, input).await);
            }
            conversation.push(ChatMessage::user(results));
        }
        Err(format!(
            "stopped after {MAX_STEPS} model steps without finishing"
        ))
    }

    /// Streams one model reply, publishing text as it arrives, and returns
    /// the assistant's content blocks.
    async fn model_step(
        &self,
        session_id: &str,
        conversation: &[ChatMessage],
    ) -> Result<Vec<ContentBlock>, String> {
        let mut rx = self.model.stream(ModelRequest {
            messages: conversation.to_vec(),
            tools: self.tools.specs(),
        });
        let mut text = String::new();
        let mut message = None;
        while let Some(item) = rx.recv().await {
            match item.map_err(|err| err.to_string())? {
                ModelEvent::TextDelta(chunk) => {
                    text.push_str(&chunk);
                    self.events.publish(SessionEvent::Output {
                        session_id: session_id.to_string(),
                        chunk,
                    });
                }
                ModelEvent::Message(content) => message = Some(content),
            }
        }
        Ok(message.unwrap_or_else(|| {
            if text.is_empty() {
                Vec::new()
            } else {
                vec![ContentBlock::Text { text }]
            }
        }))
    }

    async fn run_tool(
        &self,
        session_id: &str,
        call_id: String,
        name: String,
        input: serde_json::Value,
    ) -> ContentBlock {
        self.events.publish(SessionEvent::ToolCall {
            session_id: session_id.to_string(),
            call_id: call_id.clone(),
            name: name.clone(),
            args: input.clone(),
        });
        let tools = self.tools.clone();
        let outcome = tokio::task::spawn_blocking(move || tools.run(&name, &input))
            .await
            .unwrap_or_else(|err| tools::ToolOutcome {
                output: format!("tool failed: {err}"),
                is_error: true,
            });
        self.events.publish(SessionEvent::ToolResult {
            session_id: session_id.to_string(),
            call_id: call_id.clone(),
            output: outcome.output.clone(),
            is_error: outcome.is_error,
        });
        ContentBlock::ToolResult {
            tool_use_id: call_id,
            content: outcome.output,
            is_error: outcome.is_error,
        }
    }
}
