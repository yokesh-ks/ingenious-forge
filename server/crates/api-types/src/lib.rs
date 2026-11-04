use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A folder the user opened in Forge. Times are milliseconds since the
/// Unix epoch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[ts(type = "number")]
    pub last_opened_at: i64,
}

/// How hard the model thinks before answering (PRD §6.1 Models and
/// reasoning effort), from least to most.
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS,
)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Low,
    Medium,
    #[default]
    High,
    Xhigh,
    Max,
}

impl ReasoningEffort {
    pub const ALL: [Self; 5] = [Self::Low, Self::Medium, Self::High, Self::Xhigh, Self::Max];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Xhigh => "xhigh",
            Self::Max => "max",
        }
    }
}

impl std::str::FromStr for ReasoningEffort {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::ALL
            .into_iter()
            .find(|e| e.as_str() == s)
            .ok_or_else(|| format!("unknown reasoning effort: {s}"))
    }
}

/// How much the agent may do without asking (PRD §6.1 Approval modes).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalMode {
    /// Approve every edit and command.
    #[default]
    Ask,
    /// Edits apply freely; commands need approval.
    AutoEdit,
    /// Everything runs inside the sandbox without prompts.
    FullAuto,
}

impl ApprovalMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ask => "ask",
            Self::AutoEdit => "auto_edit",
            Self::FullAuto => "full_auto",
        }
    }
}

impl std::str::FromStr for ApprovalMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        [Self::Ask, Self::AutoEdit, Self::FullAuto]
            .into_iter()
            .find(|m| m.as_str() == s)
            .ok_or_else(|| format!("unknown approval mode: {s}"))
    }
}

/// Body of `PUT /api/sessions/{id}/approval-mode`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SetApprovalModeRequest {
    pub mode: ApprovalMode,
}

/// The provider, model and reasoning effort a session talks to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SessionModel {
    pub provider: String,
    pub model: String,
    pub effort: ReasoningEffort,
}

/// A model offered by a provider.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ModelOption {
    pub id: String,
    pub name: String,
}

/// A model provider and the models it offers, the default first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ProviderOption {
    pub id: String,
    pub name: String,
    pub models: Vec<ModelOption>,
}

/// Body of `GET /api/models`: what a new session can pick from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ModelCatalog {
    pub providers: Vec<ProviderOption>,
    pub efforts: Vec<ReasoningEffort>,
    /// The choice used when a session is created without one; `None` when
    /// no provider is configured.
    pub default: Option<SessionModel>,
}

/// Body of `POST /api/projects/{id}/sessions`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CreateSessionRequest {
    /// The model to use; the catalog default when left out.
    #[serde(default)]
    pub model: Option<SessionModel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub title: String,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
    /// True while the agent is working in this session.
    pub running: bool,
    /// The model the session was started with; `None` for sessions created
    /// before models could be picked.
    pub model: Option<SessionModel>,
    pub approval_mode: ApprovalMode,
}

/// Body of `POST /api/projects`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct OpenProjectRequest {
    pub path: String,
}

/// A sub-folder shown in the folder picker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_git_repo: bool,
}

/// One folder in the folder picker and its visible sub-folders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct DirListing {
    pub path: String,
    pub parent: Option<String>,
    pub is_git_repo: bool,
    pub entries: Vec<DirEntry>,
}

/// Body of `GET /api/projects/{id}/files`: the project's files for the
/// workspace file tree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct FileList {
    /// `/`-separated paths relative to the project folder, sorted.
    pub files: Vec<String>,
    /// True when the project has more files than were listed.
    pub truncated: bool,
}

/// Body of `GET /api/projects/{id}/file?path=`: one text file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

/// Body of `GET /api/projects/{id}/git/status`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct GitStatus {
    /// The current branch, or the short commit when `detached`; `None`
    /// only when git cannot tell.
    pub branch: Option<String>,
    pub detached: bool,
    /// Files with staged changes.
    pub staged: u32,
    /// Files with changes not staged, including new files.
    pub changed: u32,
}

/// Body of `POST /api/projects/{id}/git/branch`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CreateBranchRequest {
    pub name: String,
}

/// Body of `POST /api/projects/{id}/git/commit`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CommitRequest {
    pub message: String,
}

/// A commit just made.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CommitResult {
    /// The short commit id.
    pub sha: String,
    /// The first line of the message.
    pub summary: String,
}

/// Body of `POST /api/sessions/{id}/commit-message`: the agent's draft.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CommitMessageDraft {
    pub message: String,
}

/// What the browser sends on a project's terminal socket.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalInput {
    /// Keystrokes for the shell.
    Input {
        data: String,
    },
    Resize {
        cols: u16,
        rows: u16,
    },
}

/// Text frames the server sends on a terminal socket; output itself
/// arrives as binary frames.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalNotice {
    /// The shell exited; reconnect to start a new one.
    Exit,
}

/// The body of every failed API response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ApiError {
    pub error: String,
}

/// Messages the browser sends to the server over the session WebSocket.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Start a turn in `session_id` with `text` as the user's message, or
    /// steer the running turn: the agent reads it at its next step.
    SendMessage { session_id: String, text: String },
    /// Stop the running turn in `session_id` at its next step.
    Interrupt { session_id: String },
    /// Restore every file the agent changed in `session_id` to how it was
    /// before the agent's first edit.
    RevertAll { session_id: String },
    /// Answer the approval card for tool call `call_id`.
    AnswerApproval {
        session_id: String,
        call_id: String,
        decision: ApprovalDecision,
    },
}

/// What an approval card asks about.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalKind {
    Edit,
    Command,
}

/// The user's answer to an approval card.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    Approve,
    Deny,
    /// Approve, and approve this exact command (or edits to this file)
    /// without asking for the rest of the session.
    AlwaysAllow,
}

/// Which output stream of a command a line came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum OutputStream {
    Stdout,
    Stderr,
}

/// Events the server streams to the browser while a session runs.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SessionEvent {
    /// The user's message, as the agent accepted it (a new turn or a steer).
    UserMessage {
        session_id: String,
        text: String,
    },
    TurnStarted {
        session_id: String,
    },
    Output {
        session_id: String,
        chunk: String,
    },
    /// The agent called a tool; `call_id` pairs it with its result.
    ToolCall {
        session_id: String,
        call_id: String,
        name: String,
        args: serde_json::Value,
    },
    /// A line of output from a running command, sent as it is produced.
    ToolOutput {
        session_id: String,
        call_id: String,
        stream: OutputStream,
        text: String,
    },
    ToolResult {
        session_id: String,
        call_id: String,
        output: String,
        is_error: bool,
        /// The exit code of a shell command; `None` for other tools and
        /// for a command that did not exit normally.
        #[serde(default)]
        exit_code: Option<i32>,
    },
    /// A file the agent changed this session, as a unified diff from its
    /// content before the agent's first edit.
    FileChanged {
        session_id: String,
        path: String,
        diff: String,
        additions: u32,
        deletions: u32,
    },
    /// The agent's file changes were undone; `paths` are the files restored.
    ChangesReverted {
        session_id: String,
        paths: Vec<String>,
    },
    Error {
        session_id: String,
        message: String,
    },
    Done {
        session_id: String,
    },
    /// The user stopped the turn before it finished.
    Interrupted {
        session_id: String,
    },
    /// The session's approval mode changed; it applies to the next action.
    ApprovalModeChanged {
        session_id: String,
        mode: ApprovalMode,
    },
    /// The agent waits for the user to approve tool call `call_id`: the
    /// exact command, or the file and the diff the edit would make.
    ApprovalRequested {
        session_id: String,
        call_id: String,
        kind: ApprovalKind,
        command: Option<String>,
        path: Option<String>,
        diff: Option<String>,
    },
    /// The approval card for `call_id` was answered (a stopped turn counts
    /// as denied).
    ApprovalResolved {
        session_id: String,
        call_id: String,
        decision: ApprovalDecision,
    },
}

/// A session event as sent to the browser: the event's fields plus its
/// per-session sequence number, which starts at 1.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SessionEnvelope {
    #[ts(type = "number")]
    pub seq: u64,
    #[serde(flatten)]
    #[ts(flatten)]
    pub event: SessionEvent,
}

impl SessionEvent {
    pub fn session_id(&self) -> &str {
        match self {
            Self::UserMessage { session_id, .. }
            | Self::TurnStarted { session_id }
            | Self::Output { session_id, .. }
            | Self::ToolCall { session_id, .. }
            | Self::ToolOutput { session_id, .. }
            | Self::ToolResult { session_id, .. }
            | Self::FileChanged { session_id, .. }
            | Self::ChangesReverted { session_id, .. }
            | Self::Error { session_id, .. }
            | Self::Done { session_id }
            | Self::Interrupted { session_id }
            | Self::ApprovalModeChanged { session_id, .. }
            | Self::ApprovalRequested { session_id, .. }
            | Self::ApprovalResolved { session_id, .. } => session_id,
        }
    }
}

/// TypeScript declarations for every type the frontend exchanges with the
/// server, written to `apps/web/src/api/types.ts` (PRD §6.2 Typed API).
pub fn typescript_bindings() -> String {
    let cfg = ts_rs::Config::default();
    let decls = [
        serde_json::Value::decl(&cfg),
        Project::decl(&cfg),
        ApprovalMode::decl(&cfg),
        SetApprovalModeRequest::decl(&cfg),
        ReasoningEffort::decl(&cfg),
        SessionModel::decl(&cfg),
        ModelOption::decl(&cfg),
        ProviderOption::decl(&cfg),
        ModelCatalog::decl(&cfg),
        CreateSessionRequest::decl(&cfg),
        Session::decl(&cfg),
        OpenProjectRequest::decl(&cfg),
        DirEntry::decl(&cfg),
        DirListing::decl(&cfg),
        FileList::decl(&cfg),
        FileContent::decl(&cfg),
        GitStatus::decl(&cfg),
        CreateBranchRequest::decl(&cfg),
        CommitRequest::decl(&cfg),
        CommitResult::decl(&cfg),
        CommitMessageDraft::decl(&cfg),
        TerminalInput::decl(&cfg),
        TerminalNotice::decl(&cfg),
        ApiError::decl(&cfg),
        ApprovalKind::decl(&cfg),
        ApprovalDecision::decl(&cfg),
        ClientMessage::decl(&cfg),
        OutputStream::decl(&cfg),
        SessionEvent::decl(&cfg),
        SessionEnvelope::decl(&cfg),
    ];
    let mut out = String::from(
        "// Generated from server/crates/api-types. Do not edit by hand;\n\
         // run `UPDATE_API_TYPES=1 cargo test -p api-types` in server/.\n",
    );
    for decl in decls {
        out.push_str("\nexport ");
        out.push_str(&decl);
        out.push('\n');
    }
    out
}
