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

/// Body of `PUT /api/sessions/{id}/model`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SetSessionModelRequest {
    pub model: SessionModel,
}

/// A model offered by a provider.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ModelOption {
    pub id: String,
    pub name: String,
    /// The efforts this model accepts; empty when it has no effort setting.
    pub efforts: Vec<ReasoningEffort>,
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
    /// The choice used when a session is created without one; `None` when
    /// no provider is configured.
    pub default: Option<SessionModel>,
}

/// Body of `POST /api/projects/{id}/sessions`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CreateSessionRequest {
    /// The model to use; the saved default when left out.
    #[serde(default)]
    pub model: Option<SessionModel>,
    /// The approval mode; the saved default when left out.
    #[serde(default)]
    pub approval_mode: Option<ApprovalMode>,
}

/// What new sessions start with (`GET`/`PUT /api/settings/defaults`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SessionDefaults {
    /// `None` uses the first provider's first model.
    pub model: Option<SessionModel>,
    pub approval_mode: ApprovalMode,
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
    /// Pinned sessions stay at the top of the project's list.
    pub pinned: bool,
    /// Archived sessions are hidden from the list until restored.
    pub archived: bool,
}

/// Body of `PATCH /api/sessions/{id}`: what to change about a session.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct UpdateSessionRequest {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub pinned: Option<bool>,
    #[serde(default)]
    #[ts(optional)]
    pub archived: Option<bool>,
}

/// A program that can open a project's folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum OpenApp {
    FileManager,
    VsCode,
    Terminal,
}

/// Body of `POST /api/projects/{id}/open-in`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct OpenInRequest {
    pub app: OpenApp,
}

/// Body of `POST /api/projects`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct OpenProjectRequest {
    pub path: String,
}

/// Body of `PATCH /api/projects/{id}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct RenameProjectRequest {
    pub name: String,
}

/// Body of the `POST /api/fs/pick-folder` response: the folder chosen in
/// the operating system's dialog, or `null` when it was closed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct PickedFolder {
    pub path: Option<String>,
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

/// A branch just pushed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct PushResult {
    pub remote: String,
    /// The remote's URL, as git knows it.
    pub url: String,
    pub branch: String,
}

/// Body of `POST /api/sessions/{id}/commit-message`: the agent's draft.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct CommitMessageDraft {
    pub message: String,
}

/// Where a provider's API key comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum KeySource {
    /// Saved in Settings, encrypted on this machine.
    Settings,
    /// Taken from an environment variable such as `ANTHROPIC_API_KEY`.
    Environment,
}

/// A model provider's API key as Settings shows it: never the key itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ProviderKeyStatus {
    pub provider: String,
    pub name: String,
    /// One line on what the provider offers.
    pub description: String,
    /// The key's last four characters, when one is set.
    pub hint: Option<String>,
    pub source: Option<KeySource>,
    /// The environment variable that can hold this provider's key; empty for
    /// a custom provider.
    pub env_var: String,
    /// True for a provider the user added.
    pub custom: bool,
    /// The base URL the user set, if any.
    pub base_url: Option<String>,
    /// The base URL used when the user sets none.
    pub default_base_url: String,
    /// The model list the user set, if any.
    pub models: Option<Vec<ProviderModel>>,
    /// The models offered when the user sets none.
    pub default_models: Vec<ProviderModel>,
    /// Whether the key is good, as of the last save or key test. `None` when
    /// there is no key, or a key from the environment has not been tested.
    pub key_valid: Option<bool>,
}

/// A model a provider serves, by id and display name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
    /// How many tokens the model's context holds, when its provider says.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub context_window: Option<u64>,
}

/// Body of `PUT /api/settings/providers/{id}/customization`: what the user
/// changed about a provider. `None` means use the provider's own.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ProviderCustomization {
    pub base_url: Option<String>,
    pub models: Option<Vec<ProviderModel>>,
}

/// Body of `POST /api/settings/providers/{id}/models/fetch`: what the form
/// currently shows, which may not be saved yet. Never stored.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct FetchModelsRequest {
    pub base_url: Option<String>,
    pub key: Option<String>,
}

/// The wire format a custom provider speaks.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ApiProtocol {
    #[default]
    OpenaiChat,
    OpenaiResponses,
    AnthropicMessages,
}

/// Body of `POST /api/settings/custom-providers/models`: what the form for a
/// new custom provider shows. Never stored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct FetchCustomModelsRequest {
    pub base_url: String,
    pub protocol: ApiProtocol,
    pub key: String,
}

/// Body of `POST /api/settings/custom-providers`: an API the user adds by its
/// base URL and protocol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct AddCustomProviderRequest {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub protocol: ApiProtocol,
    pub key: String,
    /// The models to offer, the default first.
    pub models: Vec<ProviderModel>,
}

/// Body of `POST /api/settings/providers/{id}/key/test`: whether the provider
/// accepted its key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ProviderKeyTest {
    pub ok: bool,
    /// Why the test failed, in the provider's words where it gave a reason.
    pub message: Option<String>,
}

/// Body of `PUT /api/settings/providers/{id}/key`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SetProviderKeyRequest {
    pub key: String,
}

/// The GitHub connection as Settings shows it (`GET /api/settings/github`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct GitHubConnection {
    pub connected: bool,
    /// The connected account's login.
    pub login: Option<String>,
}

/// Body of `PUT /api/settings/github`: a personal access token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ConnectGitHubRequest {
    pub token: String,
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
    /// Answer the question card for tool call `call_id`, one answer per
    /// question. An answer with nothing selected and no custom text skips
    /// that question.
    AnswerQuestion {
        session_id: String,
        call_id: String,
        answers: Vec<QuestionAnswer>,
    },
}

/// A file the agent changed in a session and its diff from before the
/// first change (`GET /api/sessions/{id}/changes`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct FileChange {
    pub path: String,
    pub diff: String,
    pub additions: u32,
    pub deletions: u32,
}

/// A session's totals for the metrics under the composer and the
/// Statistics view (`GET /api/sessions/{id}/stats`, ADR 0012), folded from
/// its whole log.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SessionStats {
    pub turns: u32,
    /// Model requests that settled.
    pub steps: u32,
    /// Summed token usage over every step.
    pub usage: Usage,
    /// Summed time from each step's start to its settled reply.
    #[ts(type = "number")]
    pub model_ms: u64,
    /// Summed time tool calls ran.
    #[ts(type = "number")]
    pub tool_ms: u64,
    /// Summed time to the first token, over `ttft_steps` steps.
    #[ts(type = "number")]
    pub ttft_ms: u64,
    pub ttft_steps: u32,
    /// Summed generation time and output tokens over steps that report
    /// both, for the output speed.
    #[ts(type = "number")]
    pub decode_ms: u64,
    #[ts(type = "number")]
    pub decode_tokens: u64,
    /// The prompt size of the latest request: its input, cache reads and
    /// cache writes.
    #[ts(type = "number")]
    pub last_context_tokens: u64,
    /// The latest request's model context window, when known.
    #[ts(type = "number | null")]
    pub context_window: Option<u64>,
}

/// One question the agent asks with `ask_user_question`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct Question {
    /// Stable id, echoed in the answer.
    pub id: String,
    pub question: String,
    /// A short heading such as "Confirm".
    #[serde(default)]
    pub header: Option<String>,
    #[serde(default)]
    pub options: Vec<QuestionOption>,
    /// Whether the user may pick more than one option.
    #[serde(default)]
    pub multi_select: bool,
}

/// A choice offered for a question.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct QuestionOption {
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// The user's answer to one question: the option labels picked and any
/// text typed instead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct QuestionAnswer {
    pub id: String,
    #[serde(default)]
    pub selected: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub custom: Option<String>,
}

/// One entry of the agent's plan (`todo_write`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct TodoItem {
    pub content: String,
    pub status: TodoStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    Pending,
    InProgress,
    Completed,
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

/// The sandbox a session's commands run in, as the session header shows
/// it (PRD §6.1 Sandbox).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct SandboxInfo {
    /// `sandbox-exec`, `bubblewrap`, `none` or `unavailable`.
    pub name: String,
    /// True when commands are confined.
    pub active: bool,
    /// Folders commands may write to.
    pub writable: Vec<String>,
    pub network: bool,
    /// Why commands cannot run, when the sandbox is unavailable.
    pub problem: Option<String>,
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
    /// A new session's starting settings: its folder, model, approval mode
    /// and sandbox. Logged once, when the session is created.
    SessionStarted {
        session_id: String,
        cwd: String,
        provider: String,
        model: String,
        approval_mode: ApprovalMode,
        sandbox: Option<SandboxInfo>,
    },
    /// The user's message, as the agent accepted it (a new turn or a steer).
    UserMessage {
        session_id: String,
        text: String,
        /// How it reached the agent; `human` in logs written before ADR 0012.
        #[serde(default)]
        source: MessageSource,
    },
    /// What the next model request is sent with; logged for the session's
    /// first request and whenever the provider, model, reply cap or tool
    /// set changes. Never holds keys or HTTP headers.
    RequestHeader {
        session_id: String,
        provider: String,
        model: String,
        max_tokens: Option<u32>,
        tools: Vec<ToolSchema>,
        reason: HeaderReason,
    },
    /// The model the next requests go to and its context window, when
    /// known; logged with every `RequestHeader`.
    RequestContext {
        session_id: String,
        provider: String,
        model: String,
        #[ts(type = "number | null")]
        context_window: Option<u64>,
    },
    /// The system prompt the next requests carry; logged when it changes.
    /// Empty text means the requests carry none.
    SystemPrompt {
        session_id: String,
        text: String,
    },
    /// The session switched model; it applies from the next request.
    ModelChanged {
        session_id: String,
        from: Option<ModelRef>,
        to: ModelRef,
    },
    /// The session's title was set, by its first message or by the user.
    SessionTitle {
        session_id: String,
        title: String,
        source: TitleSource,
    },
    /// A turn began; turns are numbered from 1 within a session. Logs
    /// written before turn numbers have `turn: 0`.
    TurnStarted {
        session_id: String,
        #[serde(default)]
        turn: u32,
    },
    /// One model request of a turn began; steps are numbered from 1.
    StepStarted {
        session_id: String,
        turn: u32,
        step: u32,
    },
    /// A step's model reply settled and its tool calls returned (ADR 0012).
    StepEnded {
        session_id: String,
        turn: u32,
        step: u32,
        /// Token usage the provider reported; `None` when it reported none.
        #[serde(default)]
        usage: Option<Usage>,
        /// Step start to the first streamed delta.
        #[serde(default)]
        #[ts(type = "number | null")]
        first_token_ms: Option<u64>,
        /// First streamed delta to the settled reply.
        #[serde(default)]
        #[ts(type = "number | null")]
        generation_ms: Option<u64>,
    },
    /// A piece of the model's reasoning in step `step`, as it streams.
    ReasoningDelta {
        session_id: String,
        turn: u32,
        step: u32,
        chunk: String,
    },
    /// A step's settled assistant message: its content blocks (text,
    /// reasoning, tool calls), the provider and model that wrote it, and
    /// the tokens it used.
    AssistantMessage {
        session_id: String,
        turn: u32,
        step: u32,
        content: Vec<serde_json::Value>,
        provider: String,
        model: String,
        #[serde(default)]
        usage: Option<Usage>,
    },
    /// A model request of step `step` that failed or was stopped before
    /// its reply settled.
    AssistantAttempt {
        session_id: String,
        turn: u32,
        step: u32,
        error: String,
    },
    /// A turn ended, and why. Replaces `Done`, `Interrupted` and the
    /// turn-ending `Error` in logs written since ADR 0012.
    TurnEnded {
        session_id: String,
        turn: u32,
        reason: TurnEndReason,
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
        /// The turn and step that made the call; 0 in logs written before
        /// ADR 0012.
        #[serde(default)]
        turn: u32,
        #[serde(default)]
        step: u32,
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
        /// Structured details of the result for the UI, such as the line
        /// numbers of a read; `None` for failures and older logs.
        #[serde(default)]
        meta: Option<serde_json::Value>,
        /// When the tool started and finished running, in milliseconds
        /// since the Unix epoch; 0 in logs written before ADR 0012.
        #[serde(default)]
        #[ts(type = "number")]
        started_at: u64,
        #[serde(default)]
        #[ts(type = "number")]
        ended_at: u64,
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
    /// A session error outside a turn, such as a message the agent could
    /// not accept. Older logs also end failed turns with it.
    Error {
        session_id: String,
        message: String,
    },
    /// A turn finished. Logs written before ADR 0012 only.
    Done {
        session_id: String,
    },
    /// The user stopped the turn before it finished. Logs written before
    /// ADR 0012 only.
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
    /// The session's sandbox or writable folders changed.
    SandboxChanged {
        session_id: String,
        sandbox: SandboxInfo,
    },
    /// The agent replaced its plan with `todos` (tool call `call_id`).
    TodosUpdated {
        session_id: String,
        call_id: String,
        todos: Vec<TodoItem>,
    },
    /// The agent waits for the user to answer `questions` (tool call
    /// `call_id`).
    QuestionAsked {
        session_id: String,
        call_id: String,
        questions: Vec<Question>,
    },
    /// The question card for `call_id` was answered; `None` when it was
    /// cancelled because the turn stopped.
    QuestionAnswered {
        session_id: String,
        call_id: String,
        answers: Option<Vec<QuestionAnswer>>,
    },
}

/// Tokens one model request used, normalized across providers: `input`
/// excludes tokens served from or written to the prompt cache (ADR 0012).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct Usage {
    #[ts(type = "number")]
    pub input: u64,
    #[ts(type = "number")]
    pub output: u64,
    #[ts(type = "number")]
    pub cache_read: u64,
    #[ts(type = "number")]
    pub cache_write: u64,
}

/// How a user message reached the agent.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum MessageSource {
    /// Typed to start a turn.
    #[default]
    Human,
    /// Typed while a turn ran; the agent reads it at its next step.
    Steering,
}

/// A tool as a model request offers it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
pub struct ToolSchema {
    pub name: String,
    pub description: String,
    /// The JSON Schema of its arguments.
    pub parameters: serde_json::Value,
}

/// Why a `RequestHeader` was logged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum HeaderReason {
    /// The session's first request.
    First,
    /// The provider or model changed.
    ModelChanged,
    /// The tool set or reply cap changed.
    ToolsChanged,
}

/// A provider and one of its models.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ModelRef {
    pub provider: String,
    pub model: String,
}

/// Who set a session's title.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TitleSource {
    /// Taken from the session's first message.
    FirstMessage,
    /// Renamed by the user.
    User,
}

/// Why a turn ended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TurnEndReason {
    Completed,
    /// The user stopped it.
    Interrupted,
    /// It failed; `code` is a stable identifier such as `PROVIDER_ERROR`.
    Error {
        code: String,
        message: String,
    },
}

/// A session event as sent to the browser: the event's fields plus its
/// per-session sequence number, which starts at 1, and the time it was
/// published.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SessionEnvelope {
    #[ts(type = "number")]
    pub seq: u64,
    /// Milliseconds since the Unix epoch; 0 in logs written before
    /// ADR 0012.
    #[serde(default)]
    #[ts(type = "number")]
    pub ts: u64,
    #[serde(flatten)]
    #[ts(flatten)]
    pub event: SessionEvent,
}

impl SessionEvent {
    pub fn session_id(&self) -> &str {
        match self {
            Self::UserMessage { session_id, .. }
            | Self::TurnStarted { session_id, .. }
            | Self::StepStarted { session_id, .. }
            | Self::StepEnded { session_id, .. }
            | Self::TurnEnded { session_id, .. }
            | Self::ReasoningDelta { session_id, .. }
            | Self::AssistantMessage { session_id, .. }
            | Self::AssistantAttempt { session_id, .. }
            | Self::RequestHeader { session_id, .. }
            | Self::RequestContext { session_id, .. }
            | Self::SystemPrompt { session_id, .. }
            | Self::ModelChanged { session_id, .. }
            | Self::SessionTitle { session_id, .. }
            | Self::SessionStarted { session_id, .. }
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
            | Self::ApprovalResolved { session_id, .. }
            | Self::SandboxChanged { session_id, .. }
            | Self::TodosUpdated { session_id, .. }
            | Self::QuestionAsked { session_id, .. }
            | Self::QuestionAnswered { session_id, .. } => session_id,
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
        SetSessionModelRequest::decl(&cfg),
        ModelOption::decl(&cfg),
        ProviderOption::decl(&cfg),
        ModelCatalog::decl(&cfg),
        CreateSessionRequest::decl(&cfg),
        SessionDefaults::decl(&cfg),
        Session::decl(&cfg),
        OpenProjectRequest::decl(&cfg),
        RenameProjectRequest::decl(&cfg),
        UpdateSessionRequest::decl(&cfg),
        OpenApp::decl(&cfg),
        OpenInRequest::decl(&cfg),
        PickedFolder::decl(&cfg),
        FileList::decl(&cfg),
        FileContent::decl(&cfg),
        KeySource::decl(&cfg),
        ProviderKeyStatus::decl(&cfg),
        ApiProtocol::decl(&cfg),
        FetchCustomModelsRequest::decl(&cfg),
        AddCustomProviderRequest::decl(&cfg),
        ProviderKeyTest::decl(&cfg),
        ProviderModel::decl(&cfg),
        ProviderCustomization::decl(&cfg),
        FetchModelsRequest::decl(&cfg),
        SetProviderKeyRequest::decl(&cfg),
        GitHubConnection::decl(&cfg),
        ConnectGitHubRequest::decl(&cfg),
        GitStatus::decl(&cfg),
        CreateBranchRequest::decl(&cfg),
        CommitRequest::decl(&cfg),
        CommitResult::decl(&cfg),
        PushResult::decl(&cfg),
        CommitMessageDraft::decl(&cfg),
        TerminalInput::decl(&cfg),
        TerminalNotice::decl(&cfg),
        ApiError::decl(&cfg),
        ApprovalKind::decl(&cfg),
        ApprovalDecision::decl(&cfg),
        ClientMessage::decl(&cfg),
        OutputStream::decl(&cfg),
        SandboxInfo::decl(&cfg),
        Usage::decl(&cfg),
        TurnEndReason::decl(&cfg),
        MessageSource::decl(&cfg),
        ToolSchema::decl(&cfg),
        HeaderReason::decl(&cfg),
        ModelRef::decl(&cfg),
        TitleSource::decl(&cfg),
        FileChange::decl(&cfg),
        SessionStats::decl(&cfg),
        Question::decl(&cfg),
        QuestionOption::decl(&cfg),
        QuestionAnswer::decl(&cfg),
        TodoItem::decl(&cfg),
        TodoStatus::decl(&cfg),
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
