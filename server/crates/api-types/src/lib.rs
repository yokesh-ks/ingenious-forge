use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub created_at: String,
}

/// Messages the browser sends to the server over the session WebSocket.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Start a turn in `session_id` with `text` as the user's message.
    SendMessage { session_id: String, text: String },
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
    ToolCall {
        session_id: String,
        name: String,
        args: serde_json::Value,
    },
    Error {
        session_id: String,
        message: String,
    },
    Done {
        session_id: String,
    },
}

impl SessionEvent {
    pub fn session_id(&self) -> &str {
        match self {
            Self::TurnStarted { session_id }
            | Self::Output { session_id, .. }
            | Self::ToolCall { session_id, .. }
            | Self::Error { session_id, .. }
            | Self::Done { session_id } => session_id,
        }
    }
}

/// TypeScript declarations for every type the frontend exchanges with the
/// server, written to `apps/web/src/api/types.ts` (PRD §6.2 Typed API).
pub fn typescript_bindings() -> String {
    let cfg = ts_rs::Config::default();
    let decls = [
        serde_json::Value::decl(&cfg),
        Session::decl(&cfg),
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
