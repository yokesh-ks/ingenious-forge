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
}

/// Events the server streams to the browser while a session runs.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SessionEvent {
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
    ToolResult {
        session_id: String,
        call_id: String,
        output: String,
        is_error: bool,
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
}

impl SessionEvent {
    pub fn session_id(&self) -> &str {
        match self {
            Self::TurnStarted { session_id }
            | Self::Output { session_id, .. }
            | Self::ToolCall { session_id, .. }
            | Self::ToolResult { session_id, .. }
            | Self::FileChanged { session_id, .. }
            | Self::ChangesReverted { session_id, .. }
            | Self::Error { session_id, .. }
            | Self::Done { session_id }
            | Self::Interrupted { session_id } => session_id,
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
        Session::decl(&cfg),
        OpenProjectRequest::decl(&cfg),
        DirEntry::decl(&cfg),
        DirListing::decl(&cfg),
        ApiError::decl(&cfg),
        ClientMessage::decl(&cfg),
        SessionEvent::decl(&cfg),
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
