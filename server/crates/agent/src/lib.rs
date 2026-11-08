//! The Forge Agent: runs turns against a model provider and publishes
//! what happens as session events (PRD §6.1 Agent loop).

pub mod anthropic;
pub mod changes;
pub mod commands;
pub mod instructions;
pub mod model;
pub mod openai_compat;
mod openai_responses;
pub mod providers;
pub mod sandbox;
pub mod shell;
mod sse;
pub mod tools;

use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    sync::{Arc, Mutex},
};

use api_types::{
    ApprovalDecision, ApprovalKind, ApprovalMode, HeaderReason, MessageSource, ModelRef,
    SessionEvent, ToolSchema, TurnEndReason,
};
use services::{log::LogRecord, EventService};
use tokio::sync::watch;

use model::{ChatMessage, ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest};
use providers::{ModelChoice, Providers};
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
    #[error(transparent)]
    Model(#[from] ModelError),
    #[error("the model returned an empty reply")]
    EmptyReply,
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
    /// The system prompt, built from the project's `AGENTS.md` when the
    /// session opens.
    system: Option<String>,
    /// Nested `AGENTS.md` files already given to the model.
    instructions_loaded: BTreeSet<String>,
    /// The client for the session's provider and model; `None` when no
    /// provider is configured.
    model: Option<Arc<dyn ModelClient>>,
    effort: Option<api_types::ReasoningEffort>,
    /// `None` until set: a session opened without a mode runs without
    /// approvals.
    approval_mode: Option<api_types::ApprovalMode>,
    /// Approval cards waiting for an answer, by tool call id.
    approvals: HashMap<String, tokio::sync::oneshot::Sender<ApprovalDecision>>,
    /// Commands and edited files the user always allows this session.
    allowed: BTreeSet<String>,
    /// What the session's commands may write and reach; the project
    /// folder only, without network, until changed.
    policy: Option<sandbox::Policy>,
    /// The number of the session's latest turn; turns count from 1.
    turns: u32,
    /// The provider and model ids the session talks to, for the log.
    model_ref: Option<(String, String)>,
    /// What the last logged `RequestHeader` said; a request that differs
    /// logs a new one.
    logged_header: Option<RequestShape>,
    /// The last logged system prompt.
    logged_system: Option<String>,
}

/// The parts of a model request a `RequestHeader` records.
#[derive(Clone, PartialEq)]
struct RequestShape {
    provider: String,
    model: String,
    max_tokens: Option<u32>,
    tools: Vec<ToolSchema>,
}

/// What one step measured, for `StepEnded` (ADR 0012).
struct StepTiming {
    started: std::time::Instant,
    first_token: Option<std::time::Instant>,
    settled: Option<std::time::Instant>,
    usage: Option<api_types::Usage>,
}

impl StepTiming {
    fn new() -> Self {
        Self {
            started: std::time::Instant::now(),
            first_token: None,
            settled: None,
            usage: None,
        }
    }

    fn first_token_ms(&self) -> Option<u64> {
        self.first_token
            .map(|at| at.duration_since(self.started).as_millis() as u64)
    }

    fn generation_ms(&self) -> Option<u64> {
        Some(self.settled?.duration_since(self.first_token?).as_millis() as u64)
    }
}

/// Where a model request sits in its session.
struct StepAt<'a> {
    session_id: &'a str,
    turn: u32,
    step: u32,
}

/// Why a turn failed: a stable `code` and a message for the user.
struct TurnFailure {
    code: &'static str,
    message: String,
}

impl TurnFailure {
    fn provider(message: String) -> Self {
        Self {
            code: "PROVIDER_ERROR",
            message,
        }
    }
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
    providers: Arc<Providers>,
    /// Confines shell commands (ADR 0006).
    sandbox: sandbox::Sandbox,
    events: EventService,
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
}

impl Agent {
    /// An agent that sends every session to `model`.
    pub fn new(model: Arc<dyn ModelClient>, events: EventService) -> Self {
        let mut providers = Providers::new();
        providers.register(Arc::new(providers::FixedProvider(model)));
        Self::with_providers(providers, events)
    }

    /// An agent whose sessions pick a model from `providers`.
    pub fn with_providers(providers: Providers, events: EventService) -> Self {
        Self {
            providers: Arc::new(providers),
            sandbox: sandbox::Sandbox::Off,
            events,
            sessions: Arc::default(),
        }
    }

    /// Runs shell commands under `sandbox`. Without this, commands are
    /// not confined; the server always sets a detected sandbox.
    pub fn with_sandbox(mut self, sandbox: sandbox::Sandbox) -> Self {
        self.sandbox = sandbox;
        self
    }

    pub fn sandbox(&self) -> &sandbox::Sandbox {
        &self.sandbox
    }

    /// Closes a session that no longer exists, so nothing can use it again.
    pub fn close_session(&self, session_id: &str) {
        self.sessions.lock().unwrap().remove(session_id);
    }

    /// The sandbox and writable folders of an open session.
    pub fn sandbox_info(&self, session_id: &str) -> Option<api_types::SandboxInfo> {
        let policy = self.policy(session_id)?;
        Some(self.describe_sandbox(&policy))
    }

    /// Changes what a session's commands may write and reach, from its
    /// next command, and tells every tab. False when it is not open.
    pub fn set_sandbox_policy(&self, session_id: &str, policy: sandbox::Policy) -> bool {
        {
            let mut sessions = self.sessions.lock().unwrap();
            match sessions.get_mut(session_id).filter(|s| s.tools.is_some()) {
                Some(session) => session.policy = Some(policy.clone()),
                None => return false,
            }
        }
        self.events.publish(SessionEvent::SandboxChanged {
            session_id: session_id.to_string(),
            sandbox: self.describe_sandbox(&policy),
        });
        true
    }

    fn policy(&self, session_id: &str) -> Option<sandbox::Policy> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(session_id).filter(|s| s.tools.is_some())?;
        Some(session.policy.clone().unwrap_or_else(|| {
            sandbox::Policy::project(session.tools.as_ref().map_or(".".as_ref(), |t| t.root()))
        }))
    }

    fn describe_sandbox(&self, policy: &sandbox::Policy) -> api_types::SandboxInfo {
        let (active, problem) = match &self.sandbox {
            sandbox::Sandbox::Off => (false, None),
            sandbox::Sandbox::Unavailable(reason) => (false, Some(reason.clone())),
            _ => (true, None),
        };
        api_types::SandboxInfo {
            name: self.sandbox.name().to_string(),
            active,
            writable: policy
                .writable
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect(),
            network: policy.network,
            problem,
        }
    }

    pub fn providers(&self) -> &Providers {
        &self.providers
    }

    /// Makes `session_id` ready for messages with the default provider and
    /// model, working in the folder `tools` is rooted at. Opening a session
    /// that is already open changes nothing.
    pub fn open_session(&self, session_id: &str, tools: ToolBox) {
        let choice = self.providers.default_choice();
        let model = choice
            .as_ref()
            .and_then(|choice| self.providers.resolve(choice).ok());
        let model_ref = model
            .is_some()
            .then(|| choice.map(|c| (c.provider, c.model)))
            .flatten();
        self.open(session_id, tools, model, None, model_ref);
    }

    /// Like [`Agent::open_session`], talking to the model in `choice`.
    pub fn open_session_with(
        &self,
        session_id: &str,
        tools: ToolBox,
        choice: &ModelChoice,
    ) -> Result<(), AgentError> {
        let model = self.providers.resolve(choice)?;
        let effort = self.providers.effort_for(choice);
        let model_ref = (choice.provider.clone(), choice.model.clone());
        self.open(session_id, tools, Some(model), effort, Some(model_ref));
        Ok(())
    }

    fn open(
        &self,
        session_id: &str,
        tools: ToolBox,
        model: Option<Arc<dyn ModelClient>>,
        effort: Option<api_types::ReasoningEffort>,
        model_ref: Option<(String, String)>,
    ) {
        if self.is_open(session_id) {
            return;
        }
        let system = instructions::system_prompt(&tools);
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.entry(session_id.to_string()).or_default();
        if session.tools.is_some() {
            return;
        }
        session.tools = Some(tools);
        session.system = system;
        session.model = model;
        session.effort = effort;
        session.model_ref = model_ref;
        let unfinished = self.restore(session_id, session);
        drop(sessions);
        if let Some(turn) = unfinished {
            self.events.publish(SessionEvent::TurnEnded {
                session_id: session_id.to_string(),
                turn,
                reason: TurnEndReason::Error {
                    code: "SERVER_RESTARTED".into(),
                    message: "The server stopped during this turn, so it did not finish.".into(),
                },
            });
        }
    }

    /// Loads a session's conversation, file baselines and turn count from
    /// its log. Returns the number of the turn the log ends inside, if any.
    fn restore(&self, session_id: &str, session: &mut SessionState) -> Option<u32> {
        let log = self.events.log()?;
        let records = match log.read(session_id) {
            Ok(records) => records,
            Err(err) => {
                tracing::error!(%err, %session_id, "cannot read session log");
                return None;
            }
        };
        let mut in_turn = false;
        // Whether the open turn's `TurnStarted` was logged; a restart
        // between a message and its turn start leaves only the message.
        let mut started = false;
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
                    SessionEvent::UserMessage { .. } => in_turn = true,
                    SessionEvent::TurnStarted { turn, .. } => {
                        // Logs from before turn numbers record 0.
                        session.turns = if turn == 0 {
                            session.turns + 1
                        } else {
                            turn.max(session.turns)
                        };
                        in_turn = true;
                        started = true;
                    }
                    SessionEvent::SystemPrompt { text, .. } => session.logged_system = Some(text),
                    SessionEvent::RequestHeader {
                        provider,
                        model,
                        max_tokens,
                        tools,
                        ..
                    } => {
                        session.logged_header = Some(RequestShape {
                            provider,
                            model,
                            max_tokens,
                            tools,
                        })
                    }
                    SessionEvent::TurnEnded { .. }
                    | SessionEvent::Done { .. }
                    | SessionEvent::Error { .. }
                    | SessionEvent::Interrupted { .. } => {
                        in_turn = false;
                        started = false;
                    }
                    _ => {}
                },
            }
        }
        if !in_turn {
            return None;
        }
        if !started {
            session.turns += 1;
        }
        Some(session.turns)
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

    /// The approval mode of an open session.
    pub fn approval_mode(&self, session_id: &str) -> Option<api_types::ApprovalMode> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .get(session_id)
            .filter(|s| s.tools.is_some())
            .map(|s| s.approval_mode.unwrap_or(api_types::ApprovalMode::FullAuto))
    }

    /// Sets the approval mode of an open session; it applies from the next
    /// action. False when the session is not open.
    pub fn set_approval_mode(&self, session_id: &str, mode: api_types::ApprovalMode) -> bool {
        let mut sessions = self.sessions.lock().unwrap();
        match sessions.get_mut(session_id).filter(|s| s.tools.is_some()) {
            Some(session) => {
                session.approval_mode = Some(mode);
                true
            }
            None => false,
        }
    }

    /// Moves an open session to the model in `choice`, from its next model
    /// call. False when the session is not open.
    pub fn set_model(&self, session_id: &str, choice: &ModelChoice) -> Result<bool, AgentError> {
        let model = self.providers.resolve(choice)?;
        let effort = self.providers.effort_for(choice);
        let mut sessions = self.sessions.lock().unwrap();
        let Some(session) = sessions.get_mut(session_id).filter(|s| s.tools.is_some()) else {
            return Ok(false);
        };
        session.model = Some(model);
        session.effort = effort;
        let to = (choice.provider.clone(), choice.model.clone());
        let from = session.model_ref.replace(to.clone());
        drop(sessions);
        if from.as_ref() != Some(&to) {
            let as_ref = |(provider, model): (String, String)| ModelRef { provider, model };
            self.events.publish(SessionEvent::ModelChanged {
                session_id: session_id.to_string(),
                from: from.map(as_ref),
                to: as_ref(to),
            });
        }
        Ok(true)
    }

    /// Logs the system prompt and request header of `request` when they
    /// differ from the last ones logged for the session (ADR 0012).
    fn log_request_changes(&self, session_id: &str, request: &ModelRequest) {
        let mut events = Vec::new();
        {
            let mut sessions = self.sessions.lock().unwrap();
            let Some(session) = sessions.get_mut(session_id) else {
                return;
            };
            let system = request.system.clone().unwrap_or_default();
            let unchanged = match &session.logged_system {
                Some(logged) => *logged == system,
                // A session without a prompt has nothing to log yet.
                None => system.is_empty(),
            };
            if !unchanged {
                events.push(SessionEvent::SystemPrompt {
                    session_id: session_id.to_string(),
                    text: system.clone(),
                });
                session.logged_system = Some(system);
            }
            let (provider, model) = session.model_ref.clone().unwrap_or_default();
            let shape = RequestShape {
                provider,
                model,
                max_tokens: request.max_tokens,
                tools: request
                    .tools
                    .iter()
                    .map(|tool| ToolSchema {
                        name: tool.name.to_string(),
                        description: tool.description.to_string(),
                        parameters: tool.input_schema.clone(),
                    })
                    .collect(),
            };
            if session.logged_header.as_ref() != Some(&shape) {
                let reason = match &session.logged_header {
                    None => HeaderReason::First,
                    Some(old) if old.provider != shape.provider || old.model != shape.model => {
                        HeaderReason::ModelChanged
                    }
                    Some(_) => HeaderReason::ToolsChanged,
                };
                events.push(SessionEvent::RequestHeader {
                    session_id: session_id.to_string(),
                    provider: shape.provider.clone(),
                    model: shape.model.clone(),
                    max_tokens: shape.max_tokens,
                    tools: shape.tools.clone(),
                    reason,
                });
                events.push(SessionEvent::RequestContext {
                    session_id: session_id.to_string(),
                    provider: shape.provider.clone(),
                    model: shape.model.clone(),
                    // The model catalog does not know context windows yet.
                    context_window: None,
                });
                session.logged_header = Some(shape);
            }
        }
        for event in events {
            self.events.publish(event);
        }
    }

    /// Answers the approval card for `call_id`. False when no card for it
    /// is waiting.
    pub fn answer_approval(
        &self,
        session_id: &str,
        call_id: &str,
        decision: ApprovalDecision,
    ) -> bool {
        let waiting = {
            let mut sessions = self.sessions.lock().unwrap();
            sessions
                .get_mut(session_id)
                .and_then(|s| s.approvals.remove(call_id))
        };
        waiting.is_some_and(|tx| tx.send(decision).is_ok())
    }

    /// Asks the session's model for a commit message describing `changes`
    /// in the light of what the user asked for in this session. A one-off
    /// request: it does not join the conversation.
    pub async fn draft_commit_message(
        &self,
        session_id: &str,
        changes: &str,
    ) -> Result<String, AgentError> {
        let (model, effort, asked) = {
            let sessions = self.sessions.lock().unwrap();
            let session = sessions
                .get(session_id)
                .filter(|s| s.tools.is_some())
                .ok_or(AgentError::UnknownSession)?;
            let asked: Vec<String> = session
                .history
                .iter()
                .filter(|m| m.role == model::Role::User)
                .flat_map(|m| m.content.iter())
                .filter_map(|b| match b {
                    ContentBlock::Text { text } => Some(text.clone()),
                    _ => None,
                })
                .collect();
            (session.model.clone(), session.effort, asked)
        };
        let model = model.ok_or(ModelError::NoProvider)?;
        let asked = asked
            .iter()
            .rev()
            .take(5)
            .rev()
            .map(|t| format!("- {}", t.chars().take(500).collect::<String>()))
            .collect::<Vec<_>>()
            .join("\n");
        let prompt = format!(
            "Write a git commit message for the changes below. Use a conventional \
             commit title (type(scope): subject, at most 72 characters, no trailing \
             period), then a blank line and a short body saying what changed and why. \
             Reply with the commit message only.\n\nWhat the user asked for in this \
             session:\n{}\n\n{changes}",
            if asked.is_empty() {
                "(nothing yet)".to_string()
            } else {
                asked
            }
        );
        let mut rx = model.stream(ModelRequest {
            messages: vec![ChatMessage::user_text(prompt)],
            tools: Vec::new(),
            system: None,
            effort,
            max_tokens: None,
        });
        let mut text = String::new();
        let mut message = None;
        while let Some(item) = rx.recv().await {
            match item? {
                ModelEvent::TextDelta(chunk) => text.push_str(&chunk),
                ModelEvent::Message(content) => message = Some(content),
                ModelEvent::ReasoningDelta(_)
                | ModelEvent::ToolCallDelta
                | ModelEvent::Usage(_) => {}
            }
        }
        if let Some(content) = message {
            text = content
                .into_iter()
                .filter_map(|b| match b {
                    ContentBlock::Text { text } => Some(text),
                    _ => None,
                })
                .collect();
        }
        let text = text.trim();
        if text.is_empty() {
            return Err(AgentError::EmptyReply);
        }
        Ok(text.to_string())
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
        let user_message = |source| SessionEvent::UserMessage {
            session_id: session_id.to_string(),
            text: text.to_string(),
            source,
        };
        if session.running {
            session.pending.push(text.to_string());
            self.events.publish(user_message(MessageSource::Steering));
            return Ok(());
        }
        self.events.publish(user_message(MessageSource::Human));
        // A slash command is shown as typed; the model gets what it stands for.
        let prompt = session
            .tools
            .as_ref()
            .and_then(|tools| commands::expand(text, tools))
            .unwrap_or_else(|| text.to_string());
        let mut conversation = session.history.clone();
        let mut content = text_blocks(std::mem::take(&mut session.notes));
        content.push(ContentBlock::Text { text: prompt });
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
        session.turns += 1;
        let turn = session.turns;
        let agent = self.clone();
        tokio::spawn(async move {
            agent
                .run_turn(session_id, turn, conversation, cancelled, tools)
                .await
        });
    }

    async fn run_turn(
        self,
        session_id: String,
        turn: u32,
        mut conversation: Vec<ChatMessage>,
        cancelled: watch::Receiver<bool>,
        tools: ToolBox,
    ) {
        self.events.publish(SessionEvent::TurnStarted {
            session_id: session_id.clone(),
            turn,
        });
        let result = self
            .run_steps(&session_id, turn, &mut conversation, cancelled, &tools)
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

        self.events.publish(SessionEvent::TurnEnded {
            session_id: session_id.clone(),
            turn,
            reason: match result {
                Ok(Ending::Done) => TurnEndReason::Completed,
                Ok(Ending::Interrupted) => TurnEndReason::Interrupted,
                Err(failure) => TurnEndReason::Error {
                    code: failure.code.to_string(),
                    message: failure.message,
                },
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
        turn: u32,
        conversation: &mut Vec<ChatMessage>,
        mut cancelled: watch::Receiver<bool>,
        tools: &ToolBox,
    ) -> Result<Ending, TurnFailure> {
        for step in 1..=MAX_STEPS as u32 {
            self.events.publish(SessionEvent::StepStarted {
                session_id: session_id.to_string(),
                turn,
                step,
            });
            let mut timing = StepTiming::new();
            let at = StepAt {
                session_id,
                turn,
                step,
            };
            let outcome = self
                .run_step(&at, conversation, &mut cancelled, tools, &mut timing)
                .await;
            // Every started step ends, whether it continues the turn,
            // finishes it, is interrupted or fails.
            self.events.publish(SessionEvent::StepEnded {
                session_id: session_id.to_string(),
                turn,
                step,
                usage: timing.usage,
                first_token_ms: timing.first_token_ms(),
                generation_ms: timing.generation_ms(),
            });
            if let Some(ending) = outcome? {
                return Ok(ending);
            }
        }
        Err(TurnFailure {
            code: "MAX_STEPS",
            message: format!("stopped after {MAX_STEPS} model steps without finishing"),
        })
    }

    /// One step: a model request and the tools it calls. Returns how the
    /// turn ends, or `None` when another step follows.
    async fn run_step(
        &self,
        at: &StepAt<'_>,
        conversation: &mut Vec<ChatMessage>,
        cancelled: &mut watch::Receiver<bool>,
        tools: &ToolBox,
        timing: &mut StepTiming,
    ) -> Result<Option<Ending>, TurnFailure> {
        let session_id = at.session_id;
        let reply = self
            .model_step(at, conversation, cancelled, tools, timing)
            .await
            .map_err(TurnFailure::provider)?;
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
            return Ok(Some(Ending::Interrupted));
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
                self.run_tool(at, tools, call_id, name, input, cancelled.clone())
                    .await
            });
        }
        next.extend(text_blocks(self.take_pending(session_id)));
        if *cancelled.borrow() {
            if !next.is_empty() {
                conversation.push(ChatMessage::user(next));
            }
            return Ok(Some(Ending::Interrupted));
        }
        // No tool to answer and no message waiting: the reply is final.
        if next.is_empty() {
            return Ok(Some(Ending::Done));
        }
        conversation.push(ChatMessage::user(next));
        Ok(None)
    }

    fn take_pending(&self, session_id: &str) -> Vec<String> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions
            .get_mut(session_id)
            .map(|s| std::mem::take(&mut s.pending))
            .unwrap_or_default()
    }

    /// Streams one model reply, publishing text and reasoning as they
    /// arrive, and returns the assistant's content blocks. Records the
    /// reply's timing and usage in `timing`, and logs the settled message
    /// or the failed attempt.
    async fn model_step(
        &self,
        at: &StepAt<'_>,
        conversation: &[ChatMessage],
        cancelled: &mut watch::Receiver<bool>,
        tools: &ToolBox,
        timing: &mut StepTiming,
    ) -> Result<Reply, String> {
        let session_id = at.session_id;
        let (system, model, effort, model_ref) = {
            let sessions = self.sessions.lock().unwrap();
            let session = sessions.get(session_id);
            (
                session.and_then(|s| s.system.clone()),
                session.and_then(|s| s.model.clone()),
                session.and_then(|s| s.effort),
                session.and_then(|s| s.model_ref.clone()),
            )
        };
        let attempt_failed = |error: &str| {
            self.events.publish(SessionEvent::AssistantAttempt {
                session_id: session_id.to_string(),
                turn: at.turn,
                step: at.step,
                error: error.to_string(),
            });
        };
        let Some(model) = model else {
            let error = ModelError::NoProvider.to_string();
            attempt_failed(&error);
            return Err(error);
        };
        let request = ModelRequest {
            messages: conversation.to_vec(),
            tools: tools.specs(),
            system,
            effort,
            max_tokens: None,
        };
        self.log_request_changes(session_id, &request);
        let mut rx = model.stream(request);
        let mut text = String::new();
        let mut message = None;
        loop {
            let item = tokio::select! {
                item = rx.recv() => item,
                _ = cancelled.wait_for(|stop| *stop) => {
                    timing.settled = Some(std::time::Instant::now());
                    attempt_failed("interrupted");
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
            let event = match item {
                Ok(event) => event,
                Err(err) => {
                    let error = err.to_string();
                    attempt_failed(&error);
                    return Err(error);
                }
            };
            if matches!(
                event,
                ModelEvent::TextDelta(_)
                    | ModelEvent::ReasoningDelta(_)
                    | ModelEvent::ToolCallDelta
            ) {
                timing
                    .first_token
                    .get_or_insert_with(std::time::Instant::now);
            }
            match event {
                ModelEvent::TextDelta(chunk) => {
                    text.push_str(&chunk);
                    self.events.publish(SessionEvent::Output {
                        session_id: session_id.to_string(),
                        chunk,
                    });
                }
                ModelEvent::ReasoningDelta(chunk) => {
                    self.events.publish(SessionEvent::ReasoningDelta {
                        session_id: session_id.to_string(),
                        turn: at.turn,
                        step: at.step,
                        chunk,
                    });
                }
                ModelEvent::ToolCallDelta => {}
                ModelEvent::Usage(usage) => timing.usage = Some(usage),
                ModelEvent::Message(content) => message = Some(content),
            }
        }
        timing.settled = Some(std::time::Instant::now());
        let content = message.unwrap_or_else(|| {
            if text.is_empty() {
                Vec::new()
            } else {
                vec![ContentBlock::Text { text }]
            }
        });
        let (provider, model_id) = model_ref.unwrap_or_default();
        self.events.publish(SessionEvent::AssistantMessage {
            session_id: session_id.to_string(),
            turn: at.turn,
            step: at.step,
            content: content
                .iter()
                .filter_map(|block| serde_json::to_value(block).ok())
                .collect(),
            provider,
            model: model_id,
            usage: timing.usage,
        });
        Ok(Reply {
            content,
            interrupted: false,
        })
    }

    async fn run_tool(
        &self,
        at: &StepAt<'_>,
        tools: &ToolBox,
        call_id: String,
        name: String,
        input: serde_json::Value,
        cancelled: watch::Receiver<bool>,
    ) -> ContentBlock {
        let session_id = at.session_id;
        self.events.publish(SessionEvent::ToolCall {
            session_id: session_id.to_string(),
            call_id: call_id.clone(),
            name: name.clone(),
            args: input.clone(),
            turn: at.turn,
            step: at.step,
        });
        if let Some(denied) = self
            .approve(
                session_id,
                tools,
                &call_id,
                &name,
                &input,
                cancelled.clone(),
            )
            .await
        {
            return denied;
        }
        let started_at = services::log::now_ms();
        if name == tools::BASH {
            return self
                .run_shell(session_id, tools, call_id, &input, cancelled, started_at)
                .await;
        }
        if name == tools::WEB_FETCH {
            return self
                .run_web_fetch(session_id, call_id, &input, started_at)
                .await;
        }
        // A changed file is diffed against the file as it was before the
        // agent's first change to it in this session.
        let edited =
            ToolBox::changed_path(&name, &input).and_then(|path| tools.project_path(&path).ok());
        let needs_baseline = edited.as_ref().is_some_and(|path| {
            let sessions = self.sessions.lock().unwrap();
            !sessions
                .get(session_id)
                .is_some_and(|s| s.originals.contains_key(path))
        });

        // A tool that works under a folder brings in that folder's
        // nested AGENTS.md files the first time.
        let scope = instruction_scope(&name, &input);
        let mut loaded = match scope {
            Some(_) => {
                let sessions = self.sessions.lock().unwrap();
                sessions
                    .get(session_id)
                    .map(|s| s.instructions_loaded.clone())
                    .unwrap_or_default()
            }
            None => BTreeSet::new(),
        };

        let tools = tools.clone();
        let tracked = edited.clone();
        let (mut outcome, baseline, current, nested, loaded) =
            tokio::task::spawn_blocking(move || {
                let baseline = tracked
                    .as_deref()
                    .filter(|_| needs_baseline)
                    .and_then(|path| tools.read_text(path).ok());
                let outcome = tools.run(&name, &input);
                let current = tracked
                    .as_deref()
                    .filter(|_| !outcome.is_error)
                    .and_then(|path| tools.read_text(path).ok());
                let nested = match scope.filter(|_| !outcome.is_error) {
                    Some((path, is_dir)) => {
                        let own = tools.project_path(&path).ok();
                        instructions::nested(&tools, &path, is_dir, &mut loaded)
                            .into_iter()
                            // A file the tool just showed is not repeated.
                            .filter(|(file, _)| own.as_deref() != Some(file.as_str()))
                            .collect()
                    }
                    None => Vec::new(),
                };
                (outcome, baseline, current, nested, Some(loaded))
            })
            .await
            .unwrap_or_else(|err| {
                let outcome = tools::ToolOutcome::error(format!("tool failed: {err}"));
                (outcome, None, None, Vec::new(), None)
            });
        if let Some(loaded) = loaded {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions.entry(session_id.to_string()).or_default();
            session.instructions_loaded.extend(loaded);
        }
        outcome
            .output
            .push_str(&instructions::render_nested(&nested));
        self.events.publish(SessionEvent::ToolResult {
            session_id: session_id.to_string(),
            call_id: call_id.clone(),
            output: outcome.output.clone(),
            is_error: outcome.is_error,
            exit_code: None,
            meta: outcome.meta.clone(),
            started_at,
            ended_at: services::log::now_ms(),
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

impl Agent {
    /// Asks the user to approve a tool call when the session's approval
    /// mode requires it, and waits. Returns the tool result to send the
    /// model when the call is denied (or the turn is stopped), `None` when
    /// it may run.
    async fn approve(
        &self,
        session_id: &str,
        tools: &ToolBox,
        call_id: &str,
        name: &str,
        input: &serde_json::Value,
        mut cancelled: watch::Receiver<bool>,
    ) -> Option<ContentBlock> {
        let (kind, key) = match name {
            tools::EDIT | tools::WRITE => (
                ApprovalKind::Edit,
                tools
                    .project_path(&ToolBox::changed_path(name, input)?)
                    .ok()?,
            ),
            tools::BASH => (
                ApprovalKind::Command,
                input["command"].as_str()?.to_string(),
            ),
            _ => return None,
        };
        let allowed_key = format!("{kind:?}:{key}");
        let (tx, rx) = tokio::sync::oneshot::channel();
        {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions.get_mut(session_id)?;
            let mode = session.approval_mode.unwrap_or(ApprovalMode::FullAuto);
            let needed = match kind {
                ApprovalKind::Edit => mode == ApprovalMode::Ask,
                ApprovalKind::Command => mode != ApprovalMode::FullAuto,
            };
            if !needed || session.allowed.contains(&allowed_key) {
                return None;
            }
            session.approvals.insert(call_id.to_string(), tx);
        }

        let (command, path, diff) = match kind {
            ApprovalKind::Command => (Some(key.clone()), None, None),
            ApprovalKind::Edit => {
                let preview = {
                    let (tools, input, name) = (tools.clone(), input.clone(), name.to_string());
                    tokio::task::spawn_blocking(move || tools.preview_change(&name, &input))
                        .await
                        .ok()
                };
                match preview {
                    Some(Ok((original, content))) => {
                        let change =
                            changes::unified_diff(&key, original.as_deref(), Some(&content));
                        (None, Some(key.clone()), Some(change.diff))
                    }
                    // An edit that cannot apply fails without writing, so
                    // there is nothing to approve.
                    _ => {
                        let mut sessions = self.sessions.lock().unwrap();
                        if let Some(s) = sessions.get_mut(session_id) {
                            s.approvals.remove(call_id);
                        }
                        return None;
                    }
                }
            }
        };
        self.events.publish(SessionEvent::ApprovalRequested {
            session_id: session_id.to_string(),
            call_id: call_id.to_string(),
            kind,
            command,
            path,
            diff,
        });

        let decision = tokio::select! {
            answer = rx => answer.unwrap_or(ApprovalDecision::Deny),
            _ = cancelled.wait_for(|stop| *stop) => ApprovalDecision::Deny,
        };
        {
            let mut sessions = self.sessions.lock().unwrap();
            if let Some(session) = sessions.get_mut(session_id) {
                session.approvals.remove(call_id);
                if decision == ApprovalDecision::AlwaysAllow {
                    session.allowed.insert(allowed_key);
                }
            }
        }
        self.events.publish(SessionEvent::ApprovalResolved {
            session_id: session_id.to_string(),
            call_id: call_id.to_string(),
            decision,
        });
        if decision != ApprovalDecision::Deny {
            return None;
        }
        let output = if *cancelled.borrow() {
            INTERRUPTED_TOOL.to_string()
        } else {
            "The user denied this action, so it did not run.".to_string()
        };
        // It never ran, so it starts and ends at once.
        let now = services::log::now_ms();
        self.events.publish(SessionEvent::ToolResult {
            session_id: session_id.to_string(),
            call_id: call_id.to_string(),
            output: output.clone(),
            is_error: true,
            exit_code: None,
            meta: None,
            started_at: now,
            ended_at: now,
        });
        Some(ContentBlock::ToolResult {
            tool_use_id: call_id.to_string(),
            content: output,
            is_error: true,
        })
    }

    /// Fetches a web page as text, when the session's sandbox allows the
    /// network (PRD §6.1 Sandbox, ADR 0014).
    async fn run_web_fetch(
        &self,
        session_id: &str,
        call_id: String,
        input: &serde_json::Value,
        started_at: u64,
    ) -> ContentBlock {
        let network = self.policy(session_id).is_some_and(|policy| policy.network);
        let (outcome, meta) = match input["url"].as_str() {
            None => (
                tools::ToolOutcome::error("missing string argument: url"),
                None,
            ),
            Some(_) if !network => (
                tools::ToolOutcome::error(
                    "Network access is off for this session, so the page was not fetched. \
                     The user can allow network access in the session's sandbox settings.",
                ),
                None,
            ),
            Some(url) => fetch_text(url).await,
        };
        let ended_at = services::log::now_ms();
        self.events.publish(SessionEvent::ToolResult {
            session_id: session_id.to_string(),
            call_id: call_id.clone(),
            output: outcome.output.clone(),
            is_error: outcome.is_error,
            exit_code: None,
            meta,
            started_at,
            ended_at,
        });
        ContentBlock::ToolResult {
            tool_use_id: call_id,
            content: outcome.output,
            is_error: outcome.is_error,
        }
    }

    /// Runs a shell command, publishing each output line as it arrives.
    async fn run_shell(
        &self,
        session_id: &str,
        tools: &ToolBox,
        call_id: String,
        input: &serde_json::Value,
        cancelled: watch::Receiver<bool>,
        started_at: u64,
    ) -> ContentBlock {
        let outcome = match input["command"].as_str().filter(|c| !c.trim().is_empty()) {
            Some(command) => {
                let events = self.events.clone();
                let (sid, cid) = (session_id.to_string(), call_id.clone());
                let policy = self
                    .policy(session_id)
                    .unwrap_or_else(|| sandbox::Policy::project(tools.root()));
                shell::run_in(
                    &self.sandbox,
                    &policy,
                    tools.root(),
                    command,
                    move |line| {
                        events.publish(SessionEvent::ToolOutput {
                            session_id: sid.clone(),
                            call_id: cid.clone(),
                            stream: line.stream,
                            text: line.text,
                        });
                    },
                    cancelled,
                )
                .await
            }
            None => shell::ShellOutcome {
                output: "missing string argument: command".into(),
                exit_code: None,
                is_error: true,
                interrupted: false,
            },
        };
        let ended_at = services::log::now_ms();
        self.events.publish(SessionEvent::ToolResult {
            session_id: session_id.to_string(),
            call_id: call_id.clone(),
            output: outcome.output.clone(),
            is_error: outcome.is_error,
            exit_code: outcome.exit_code,
            meta: Some(serde_json::json!({
                "cwd": tools.root().display().to_string(),
                "exit_code": outcome.exit_code,
                "duration_ms": ended_at.saturating_sub(started_at),
            })),
            started_at,
            ended_at,
        });
        ContentBlock::ToolResult {
            tool_use_id: call_id,
            content: outcome.output,
            is_error: outcome.is_error,
        }
    }
}

/// The most a fetched page may weigh, and the most text kept from it.
const MAX_FETCH_BYTES: usize = 5_000_000;
const MAX_FETCH_CHARS: usize = 100_000;

/// Fetches `url` and returns its text and details, or why it failed.
async fn fetch_text(url: &str) -> (tools::ToolOutcome, Option<serde_json::Value>) {
    let parsed = match reqwest::Url::parse(url) {
        Ok(parsed) if matches!(parsed.scheme(), "http" | "https") => parsed,
        Ok(_) => {
            return (
                tools::ToolOutcome::error("only http and https URLs can be fetched"),
                None,
            )
        }
        Err(err) => {
            return (
                tools::ToolOutcome::error(format!("invalid URL: {err}")),
                None,
            )
        }
    };
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("ingenious-forge")
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            return (
                tools::ToolOutcome::error(format!("cannot fetch: {err}")),
                None,
            )
        }
    };
    let mut response = match client.get(parsed.clone()).send().await {
        Ok(response) => response,
        Err(err) => {
            return (
                tools::ToolOutcome::error(format!("cannot fetch {url}: {err}")),
                None,
            )
        }
    };
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let mut body = Vec::new();
    let mut cut = false;
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                body.extend_from_slice(&chunk);
                if body.len() > MAX_FETCH_BYTES {
                    body.truncate(MAX_FETCH_BYTES);
                    cut = true;
                    break;
                }
            }
            Ok(None) => break,
            Err(err) => {
                return (
                    tools::ToolOutcome::error(format!("cannot read {url}: {err}")),
                    None,
                )
            }
        }
    }
    let raw = String::from_utf8_lossy(&body);
    let mut text = if content_type.contains("html") || raw.trim_start().starts_with('<') {
        tools::html_to_text(&raw)
    } else {
        raw.into_owned()
    };
    if text.chars().count() > MAX_FETCH_CHARS {
        text = text.chars().take(MAX_FETCH_CHARS).collect();
        cut = true;
    }
    if cut {
        text.push_str("\n\n[The page was longer; this is its beginning.]");
    }
    let meta = serde_json::json!({
        "url": parsed.as_str(),
        "status": status.as_u16(),
        "bytes": body.len(),
        "content_type": content_type,
    });
    if !status.is_success() {
        let outcome = tools::ToolOutcome::error(format!("HTTP {status}\n\n{text}"));
        return (outcome, Some(meta));
    }
    (
        tools::ToolOutcome {
            output: text,
            is_error: false,
            meta: Some(meta.clone()),
        },
        Some(meta),
    )
}

/// The path a tool call works on, and whether it is a folder, for tools
/// whose folder's instructions apply.
fn instruction_scope(name: &str, input: &serde_json::Value) -> Option<(String, bool)> {
    match name {
        tools::READ | tools::EDIT | tools::WRITE => {
            input["file_path"].as_str().map(|p| (p.to_string(), false))
        }
        tools::GLOB | tools::GREP => {
            Some((input["path"].as_str().unwrap_or(".").to_string(), true))
        }
        _ => None,
    }
}

fn text_blocks(texts: Vec<String>) -> Vec<ContentBlock> {
    texts
        .into_iter()
        .map(|text| ContentBlock::Text { text })
        .collect()
}
