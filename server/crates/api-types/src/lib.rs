use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SessionEvent {
    Output {
        session_id: String,
        chunk: String,
    },
    ToolCall {
        session_id: String,
        name: String,
        args: serde_json::Value,
    },
    Done {
        session_id: String,
    },
}
