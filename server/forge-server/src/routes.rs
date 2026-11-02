use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
    routing::get,
    Json, Router,
};
use serde_json::json;

use crate::state::AppState;

pub fn api_router() -> Router<Arc<AppState>> {
    Router::new().route("/sessions", get(list_sessions))
}

async fn list_sessions(State(_state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(json!([]))
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    tracing::info!("WebSocket connected");
    let mut rx = state.events.subscribe();
    while let Ok(event) = rx.recv().await {
        let Ok(payload) = serde_json::to_string(&event) else {
            tracing::warn!("failed to serialize event");
            continue;
        };
        if socket.send(Message::Text(payload.into())).await.is_err() {
            break;
        }
    }
    tracing::info!("WebSocket disconnected");
}
