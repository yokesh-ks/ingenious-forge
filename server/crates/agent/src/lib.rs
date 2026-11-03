//! The Forge Agent: runs turns against a model provider and publishes
//! what happens as session events (PRD §6.1 Agent loop).

pub mod anthropic;
pub mod changes;
pub mod model;
mod sse;
pub mod tools;

use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
};

use api_types::SessionEvent;
use services::{log::LogRecord, EventService};
use tokio::sync::watch;

use model::{ChatMessage, ContentBlock, ModelClient, ModelEvent, ModelRequest};
use tools::ToolBox;

/// Model calls allowed in one turn before the agent gives up, so a model
/// that keeps calling tools cannot run forever.
const MAX_STEPS: usize = 50;

const INTERRUPTED_TOOL: &str = "Interrupted by the user before this tool ran.";

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AgentError {
    #[error("message is empty")]
    EmptyMessage,
    #[error("stop the running turn before reverting changes")]
    TurnRunning,
    #[error("this session is not open")]
    UnknownSession,
}

#[derive(Default)]
struct SessionState {
    /// The session's file tools, rooted at its project folder.
    tools: Option<ToolBox>,
    history: Vec<ChatMessage>,
    running: bool,
    /// Messages sent while a turn runs; the turn reads them at its next step.
    pending: Vec<String>,
    /// Set to true to stop the running turn.
    cancel: Option<watch::Sender<bool>>,
    /// Each file the agent edited, with its content before the first edit
    /// (`None` when the agent created it).
    originals: BTreeMap<String, Option<String>>,
    /// Notes for the model, sent with the user's next message.
    notes: Vec<String>,
}

/// How a turn that did not fail came to an end.
enum Ending {
    Done,
    Interrupted,
}

/// One model reply; `interrupted` means it was cut off by the user.
struct Reply {
    content: Vec<ContentBlock>,
    interrupted: bool,
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

    /// Makes `session_id` ready for messages, working in the folder `tools`
    /// is rooted at. Opening a session that is already open changes nothing.
    pub fn open_session(&self, session_id: &str, tools: ToolBox) {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.entry(session_id.to_string()).or_default();
        if session.tools.is_some() {
            return;
        }
        session.tools = Some(tools);
        let unfinished = self.restore(session_id, session);
        drop(sessions);
        if unfinished {
            self.events.publish(SessionEvent::Error {
                session_id: session_id.to_string(),
                message: "The server stopped during this turn, so it did not finish.".into(),
            });
        }
    }

    /// Loads a session's conversation and file baselines from its log.
    /// Returns true when the log ends inside a turn.
    fn restore(&self, session_id: &str, session: &mut SessionState) -> bool {
        let Some(log) = self.events.log() else {
            return false;
        };
        let records = match log.read(session_id) {
            Ok(records) => records,
            Err(err) => {
                tracing::error!(%err, %session_id, "cannot read session log");
                return false;
            }
        };
        let mut in_turn = false;
        for record in records {
            match record {
                LogRecord::Message { message } => match serde_json::from_value(message) {
                    Ok(message) => session.history.push(message),
                    Err(err) => tracing::warn!(%err, %session_id, "skipping unreadable message"),
                },
                LogRecord::Original { path, content } => {
                    session.originals.entry(path).or_insert(content);
                }
                LogRecord::Originals { originals } => session.originals = originals,
                LogRecord::Event { event, .. } => match event {
                    // A message is logged before its turn starts, so a
                    // restart between the two still leaves a turn open.
                    SessionEvent::UserMessage { .. } | SessionEvent::TurnStarted { .. } => {
                        in_turn = true
                    }
                    SessionEvent::Done { .. }
                    | SessionEvent::Error { .. }
                    | SessionEvent::Interrupted { .. } => in_turn = false,
                    _ => {}
                },
            }
        }
        in_turn
    }

    fn log(&self, session_id: &str, record: &LogRecord) {
        if let Some(log) = self.events.log() {
            if let Err(err) = log.append(session_id, record) {
                tracing::error!(%err, %session_id, "cannot write session log");
            }
        }
    }

    pub fn is_open(&self, session_id: &str) -> bool {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(session_id).is_some_and(|s| s.tools.is_some())
    }

    pub fn is_running(&self, session_id: &str) -> bool {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(session_id).is_some_and(|s| s.running)
    }

    /// Starts a turn for `text` in `session_id` and returns at once; the
    /// reply arrives as session events. While a turn runs, the message
    /// steers it instead: the agent reads it at its next step.
    pub fn send_message(&self, session_id: &str, text: &str) -> Result<(), AgentError> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AgentError::EmptyMessage);
        }
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .filter(|s| s.tools.is_some())
            .ok_or(AgentError::UnknownSession)?;
        let user_message = || SessionEvent::UserMessage {
            session_id: session_id.to_string(),
            text: text.to_string(),
        };
        if session.running {
            session.pending.push(text.to_string());
            self.events.publish(user_message());
            return Ok(());
        }
        self.events.publish(user_message());
        let mut conversation = session.history.clone();
        let mut content = text_blocks(std::mem::take(&mut session.notes));
        content.push(ContentBlock::Text { text: text.into() });
        conversation.push(ChatMessage::user(content));
        self.start_turn(session, session_id.to_string(), conversation);
        Ok(())
    }

    /// Restores every file the agent changed in `session_id` to its content
    /// before the agent's first edit, and removes files it created.
    pub async fn revert_all(&self, session_id: &str) -> Result<(), AgentError> {
        let (originals, tools) = {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions
                .get_mut(session_id)
                .ok_or(AgentError::UnknownSession)?;
            let tools = session.tools.clone().ok_or(AgentError::UnknownSession)?;
            if session.running {
                return Err(AgentError::TurnRunning);
            }
            (std::mem::take(&mut session.originals), tools)
        };

        let (restored, failed) = tokio::task::spawn_blocking(move || {
            let mut restored = Vec::new();
            let mut failed = BTreeMap::new();
            for (path, original) in originals {
                match tools.restore(&path, original.as_deref()) {
                    Ok(()) => restored.push(path),
                    Err(err) => {
                        failed.insert(path, (original, err));
                    }
                }
            }
            (restored, failed)
        })
        .await
        .unwrap_or_default();

        {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions.entry(session_id.to_string()).or_default();
            if !restored.is_empty() {
                session.notes.push(format!(
                    "Note: the user reverted every file change you made in this session ({}). \
                     Those files are back to how they were before your edits.",
                    restored.join(", ")
                ));
            }
            // A file that could not be restored stays tracked so the user
            // can try again.
            for (path, (original, _)) in &failed {
                session.originals.insert(path.clone(), original.clone());
            }
            self.log(
                session_id,
                &LogRecord::Originals {
                    originals: session.originals.clone(),
                },
            );
        }

        self.events.publish(SessionEvent::ChangesReverted {
            session_id: session_id.to_string(),
            paths: restored,
        });
        if !failed.is_empty() {
            let reasons: Vec<_> = failed.values().map(|(_, err)| err.as_str()).collect();
            self.events.publish(SessionEvent::Error {
                session_id: session_id.to_string(),
                message: reasons.join("; "),
            });
        }
        Ok(())
    }

    /// Stops the running turn in `session_id` at its next step. Returns
    /// false when no turn is running.
    pub fn interrupt(&self, session_id: &str) -> bool {
        let sessions = self.sessions.lock().unwrap();
        match sessions.get(session_id) {
            Some(SessionState {
                running: true,
                cancel: Some(cancel),
                ..
            }) => {
                cancel.send_replace(true);
                true
            }
            _ => false,
        }
    }

    fn start_turn(
        &self,
        session: &mut SessionState,
        session_id: String,
        conversation: Vec<ChatMessage>,
    ) {
        let Some(tools) = session.tools.clone() else {
            return;
        };
        let (cancel, cancelled) = watch::channel(false);
        session.running = true;
        session.cancel = Some(cancel);
        let agent = self.clone();
        tokio::spawn(async move {
            agent
                .run_turn(session_id, conversation, cancelled, tools)
                .await
        });
    }

    async fn run_turn(
        self,
        session_id: String,
        mut conversation: Vec<ChatMessage>,
        cancelled: watch::Receiver<bool>,
        tools: ToolBox,
    ) {
        self.events.publish(SessionEvent::TurnStarted {
            session_id: session_id.clone(),
        });
        let result = self
            .run_steps(&session_id, &mut conversation, cancelled, &tools)
            .await;

        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.entry(session_id.clone()).or_default();
        session.running = false;
        session.cancel = None;
        // A failed exchange does not join the history, so a retry does not
        // replay the failed prompt. An interrupted one does: every tool call
        // in it has a result, so the conversation stays valid.
        if result.is_ok() {
            for message in conversation.iter().skip(session.history.len()) {
                match serde_json::to_value(message) {
                    Ok(message) => self.log(&session_id, &LogRecord::Message { message }),
                    Err(err) => tracing::error!(%err, "cannot serialize message"),
                }
            }
            session.history = conversation;
        }
        // A message that arrived after the last step starts the next turn.
        let leftover = std::mem::take(&mut session.pending);

        self.events.publish(match result {
            Ok(Ending::Done) => SessionEvent::Done {
                session_id: session_id.clone(),
            },
            Ok(Ending::Interrupted) => SessionEvent::Interrupted {
                session_id: session_id.clone(),
            },
            Err(message) => SessionEvent::Error {
                session_id: session_id.clone(),
                message,
            },
        });

        if !leftover.is_empty() {
            let mut next = session.history.clone();
            next.push(ChatMessage::user(text_blocks(leftover)));
            self.start_turn(session, session_id, next);
        }
    }

    /// Calls the model, runs the tools it asks for and feeds their results
    /// (and any steering messages) back until it replies without a tool
    /// call and no message is waiting.
    async fn run_steps(
        &self,
        session_id: &str,
        conversation: &mut Vec<ChatMessage>,
        mut cancelled: watch::Receiver<bool>,
        tools: &ToolBox,
    ) -> Result<Ending, String> {
        for _ in 0..MAX_STEPS {
            let reply = self
                .model_step(session_id, conversation, &mut cancelled, tools)
                .await?;
            let calls: Vec<_> = reply
                .content
                .iter()
                .filter_map(|block| match block {
                    ContentBlock::ToolUse { id, name, input } => {
                        Some((id.clone(), name.clone(), input.clone()))
                    }
                    _ => None,
                })
                .collect();
            if !reply.content.is_empty() {
                conversation.push(ChatMessage::assistant(reply.content));
            }
            if reply.interrupted {
                return Ok(Ending::Interrupted);
            }

            let mut next = Vec::with_capacity(calls.len());
            for (call_id, name, input) in calls {
                next.push(if *cancelled.borrow() {
                    ContentBlock::ToolResult {
                        tool_use_id: call_id,
                        content: INTERRUPTED_TOOL.into(),
                        is_error: true,
                    }
                } else {
                    self.run_tool(session_id, tools, call_id, name, input).await
                });
            }
            next.extend(text_blocks(self.take_pending(session_id)));
            if *cancelled.borrow() {
                if !next.is_empty() {
                    conversation.push(ChatMessage::user(next));
                }
                return Ok(Ending::Interrupted);
            }
            // No tool to answer and no message waiting: the reply is final.
            if next.is_empty() {
                return Ok(Ending::Done);
            }
            conversation.push(ChatMessage::user(next));
        }
        Err(format!(
            "stopped after {MAX_STEPS} model steps without finishing"
        ))
    }

    fn take_pending(&self, session_id: &str) -> Vec<String> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions
            .get_mut(session_id)
            .map(|s| std::mem::take(&mut s.pending))
            .unwrap_or_default()
    }

    /// Streams one model reply, publishing text as it arrives, and returns
    /// the assistant's content blocks.
    async fn model_step(
        &self,
        session_id: &str,
        conversation: &[ChatMessage],
        cancelled: &mut watch::Receiver<bool>,
        tools: &ToolBox,
    ) -> Result<Reply, String> {
        let mut rx = self.model.stream(ModelRequest {
            messages: conversation.to_vec(),
            tools: tools.specs(),
        });
        let mut text = String::new();
        let mut message = None;
        loop {
            let item = tokio::select! {
                item = rx.recv() => item,
                _ = cancelled.wait_for(|stop| *stop) => {
                    // Keep what was shown so far; drop the rest of the reply.
                    let content = if text.is_empty() {
                        Vec::new()
                    } else {
                        vec![ContentBlock::Text { text }]
                    };
                    return Ok(Reply { content, interrupted: true });
                }
            };
            let Some(item) = item else { break };
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
        let content = message.unwrap_or_else(|| {
            if text.is_empty() {
                Vec::new()
            } else {
                vec![ContentBlock::Text { text }]
            }
        });
        Ok(Reply {
            content,
            interrupted: false,
        })
    }

    async fn run_tool(
        &self,
        session_id: &str,
        tools: &ToolBox,
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
        // An edit is diffed against the file as it was before the agent's
        // first edit to it in this session.
        let edited = (name == tools::EDIT_FILE)
            .then(|| input["path"].as_str())
            .flatten()
            .and_then(|path| tools.project_path(path).ok());
        let needs_baseline = edited.as_ref().is_some_and(|path| {
            let sessions = self.sessions.lock().unwrap();
            !sessions
                .get(session_id)
                .is_some_and(|s| s.originals.contains_key(path))
        });

        let tools = tools.clone();
        let tracked = edited.clone();
        let (outcome, baseline, current) = tokio::task::spawn_blocking(move || {
            let baseline = tracked
                .as_deref()
                .filter(|_| needs_baseline)
                .and_then(|path| tools.read_text(path).ok());
            let outcome = tools.run(&name, &input);
            let current = tracked
                .as_deref()
                .filter(|_| !outcome.is_error)
                .and_then(|path| tools.read_text(path).ok());
            (outcome, baseline, current)
        })
        .await
        .unwrap_or_else(|err| {
            let outcome = tools::ToolOutcome {
                output: format!("tool failed: {err}"),
                is_error: true,
            };
            (outcome, None, None)
        });
        self.events.publish(SessionEvent::ToolResult {
            session_id: session_id.to_string(),
            call_id: call_id.clone(),
            output: outcome.output.clone(),
            is_error: outcome.is_error,
        });

        if let (Some(path), Some(current)) = (edited, current) {
            let original = {
                let mut sessions = self.sessions.lock().unwrap();
                let session = sessions.entry(session_id.to_string()).or_default();
                if let Some(baseline) = baseline {
                    if !session.originals.contains_key(&path) {
                        self.log(
                            session_id,
                            &LogRecord::Original {
                                path: path.clone(),
                                content: baseline.clone(),
                            },
                        );
                        session.originals.insert(path.clone(), baseline);
                    }
                }
                session.originals.get(&path).cloned()
            };
            if let Some(original) = original {
                let change = changes::unified_diff(&path, original.as_deref(), current.as_deref());
                self.events.publish(SessionEvent::FileChanged {
                    session_id: session_id.to_string(),
                    path: change.path,
                    diff: change.diff,
                    additions: change.additions,
                    deletions: change.deletions,
                });
            }
        }
        ContentBlock::ToolResult {
            tool_use_id: call_id,
            content: outcome.output,
            is_error: outcome.is_error,
        }
    }
}

fn text_blocks(texts: Vec<String>) -> Vec<ContentBlock> {
    texts
        .into_iter()
        .map(|text| ContentBlock::Text { text })
        .collect()
}
