//! The Forge Agent: runs turns against a model provider and publishes
//! what happens as session events (PRD §6.1 Agent loop).

pub mod anthropic;
pub mod model;
mod sse;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use api_types::SessionEvent;
use services::EventService;

use model::{ChatMessage, ModelClient, ModelEvent, ModelRequest, Role};

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
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
}

impl Agent {
    pub fn new(model: Arc<dyn ModelClient>, events: EventService) -> Self {
        Self {
            model,
            events,
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
        let request = {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions.entry(session_id.to_string()).or_default();
            if session.running {
                return Err(AgentError::TurnInProgress);
            }
            session.running = true;
            let mut messages = session.history.clone();
            messages.push(ChatMessage {
                role: Role::User,
                content: text.to_string(),
            });
            ModelRequest { messages }
        };
        let agent = self.clone();
        let session_id = session_id.to_string();
        tokio::spawn(async move { agent.run_turn(session_id, request).await });
        Ok(())
    }

    async fn run_turn(self, session_id: String, request: ModelRequest) {
        self.events.publish(SessionEvent::TurnStarted {
            session_id: session_id.clone(),
        });
        let mut rx = self.model.stream(request.clone());
        let mut reply = String::new();
        let mut failure = None;
        while let Some(item) = rx.recv().await {
            match item {
                Ok(ModelEvent::TextDelta(chunk)) => {
                    reply.push_str(&chunk);
                    self.events.publish(SessionEvent::Output {
                        session_id: session_id.clone(),
                        chunk,
                    });
                }
                Err(err) => {
                    failure = Some(err.to_string());
                    break;
                }
            }
        }

        {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions.entry(session_id.clone()).or_default();
            session.running = false;
            // Only a completed exchange joins the history, so a retry after
            // a failure does not replay the failed prompt.
            if failure.is_none() {
                session.history = request.messages;
                session.history.push(ChatMessage {
                    role: Role::Assistant,
                    content: reply,
                });
            }
        }

        self.events.publish(match failure {
            Some(message) => SessionEvent::Error {
                session_id,
                message,
            },
            None => SessionEvent::Done { session_id },
        });
    }
}
