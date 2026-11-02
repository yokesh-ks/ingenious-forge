use std::sync::Arc;

use api_types::{ClientMessage, SessionEvent};
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
use tokio::sync::broadcast;

use crate::state::AppState;

/// The API and WebSocket routes, without the static SPA fallback.
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .nest("/api", api_router())
        .route("/ws", get(ws_handler))
}

fn api_router() -> Router<Arc<AppState>> {
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
    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => handle_client_message(&state, &text),
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
            event = rx.recv() => match event {
                Ok(event) => {
                    let Ok(payload) = serde_json::to_string(&event) else {
                        tracing::warn!("failed to serialize event");
                        continue;
                    };
                    if socket.send(Message::Text(payload.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "WebSocket client fell behind; events dropped");
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
        }
    }
    tracing::info!("WebSocket disconnected");
}

fn handle_client_message(state: &AppState, text: &str) {
    let message = match serde_json::from_str::<ClientMessage>(text) {
        Ok(message) => message,
        Err(err) => {
            tracing::warn!(%err, "ignoring malformed client message");
            return;
        }
    };
    match message {
        ClientMessage::SendMessage { session_id, text } => {
            if let Err(err) = state.agent.send_message(&session_id, &text) {
                state.events.publish(SessionEvent::Error {
                    session_id,
                    message: err.to_string(),
                });
            }
        }
        ClientMessage::RevertAll { session_id } => {
            let agent = state.agent.clone();
            let events = state.events.clone();
            tokio::spawn(async move {
                if let Err(err) = agent.revert_all(&session_id).await {
                    events.publish(SessionEvent::Error {
                        session_id,
                        message: err.to_string(),
                    });
                }
            });
        }
        ClientMessage::Interrupt { session_id } => {
            if !state.agent.interrupt(&session_id) {
                tracing::debug!(%session_id, "interrupt with no running turn");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::VecDeque,
        sync::Mutex,
        time::{Duration, Instant},
    };

    use agent::{
        model::{ModelClient, ModelError, ModelEvent, ModelRequest},
        tools::ToolBox,
        Agent,
    };
    use futures_util::{SinkExt, StreamExt};
    use serde_json::{json, Value};
    use services::EventService;
    use tokio::{net::TcpStream, sync::mpsc};
    use tokio_tungstenite::{
        connect_async, tungstenite::Message as WsMessage, MaybeTlsStream, WebSocketStream,
    };

    use super::*;

    type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

    /// Replies with one scripted list of chunks per request; each chunk is
    /// emitted after `delay`, and `emitted_at` records when.
    struct ScriptedModel {
        replies: Mutex<VecDeque<Vec<&'static str>>>,
        delay: Duration,
        emitted_at: Arc<Mutex<Vec<Instant>>>,
    }

    impl ModelClient for ScriptedModel {
        fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
            let chunks = self.replies.lock().unwrap().pop_front().unwrap_or_default();
            let (delay, emitted_at) = (self.delay, self.emitted_at.clone());
            let (tx, rx) = mpsc::channel(16);
            tokio::spawn(async move {
                for chunk in chunks {
                    tokio::time::sleep(delay).await;
                    emitted_at.lock().unwrap().push(Instant::now());
                    let _ = tx.send(Ok(ModelEvent::TextDelta(chunk.into()))).await;
                }
            });
            rx
        }
    }

    async fn start(
        replies: Vec<Vec<&'static str>>,
        delay: Duration,
    ) -> (String, Arc<Mutex<Vec<Instant>>>) {
        let emitted_at = Arc::new(Mutex::new(Vec::new()));
        let model = ScriptedModel {
            replies: Mutex::new(replies.into()),
            delay,
            emitted_at: emitted_at.clone(),
        };
        let events = EventService::new();
        let state = Arc::new(AppState {
            db: db::connect(":memory:").await.unwrap(),
            agent: Agent::new(
                Arc::new(model),
                events.clone(),
                ToolBox::new(std::env::temp_dir()),
            ),
            events,
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router().with_state(state))
                .await
                .unwrap();
        });
        (format!("ws://{addr}/ws"), emitted_at)
    }

    async fn connect(url: &str) -> Ws {
        let (ws, _) = connect_async(url).await.unwrap();
        // Let the server subscribe before anything is published.
        tokio::time::sleep(Duration::from_millis(20)).await;
        ws
    }

    async fn send(ws: &mut Ws, value: Value) {
        ws.send(WsMessage::text(value.to_string())).await.unwrap();
    }

    async fn next_event(ws: &mut Ws) -> Value {
        loop {
            let msg = tokio::time::timeout(Duration::from_secs(2), ws.next())
                .await
                .expect("timed out waiting for an event")
                .unwrap()
                .unwrap();
            if let WsMessage::Text(text) = msg {
                return serde_json::from_str(&text).unwrap();
            }
        }
    }

    async fn until_end(ws: &mut Ws) -> Vec<Value> {
        let mut out = Vec::new();
        loop {
            let event = next_event(ws).await;
            let end = event["type"] == "done" || event["type"] == "error";
            out.push(event);
            if end {
                return out;
            }
        }
    }

    fn send_message(session_id: &str, text: &str) -> Value {
        json!({ "type": "send_message", "session_id": session_id, "text": text })
    }

    #[tokio::test]
    async fn sending_a_message_streams_the_turn_back() {
        let (url, _) = start(vec![vec!["Hel", "lo"]], Duration::ZERO).await;
        let mut ws = connect(&url).await;

        send(&mut ws, send_message("s1", "hi")).await;

        assert_eq!(
            until_end(&mut ws).await,
            vec![
                json!({"type":"turn_started","session_id":"s1"}),
                json!({"type":"output","session_id":"s1","chunk":"Hel"}),
                json!({"type":"output","session_id":"s1","chunk":"lo"}),
                json!({"type":"done","session_id":"s1"}),
            ]
        );
    }

    #[tokio::test]
    async fn every_open_tab_sees_the_turn() {
        let (url, _) = start(vec![vec!["x"]], Duration::ZERO).await;
        let mut sender = connect(&url).await;
        let mut viewer = connect(&url).await;

        send(&mut sender, send_message("s1", "hi")).await;

        assert_eq!(until_end(&mut sender).await.len(), 3);
        assert_eq!(until_end(&mut viewer).await.len(), 3);
    }

    #[tokio::test]
    async fn malformed_message_is_ignored_and_socket_stays_open() {
        let (url, _) = start(vec![vec!["ok"]], Duration::ZERO).await;
        let mut ws = connect(&url).await;

        ws.send(WsMessage::text("not json")).await.unwrap();
        send(&mut ws, json!({"type":"unknown"})).await;
        send(&mut ws, send_message("s1", "hi")).await;

        assert_eq!(next_event(&mut ws).await["type"], "turn_started");
    }

    #[tokio::test]
    async fn empty_message_returns_an_error_event() {
        let (url, _) = start(vec![], Duration::ZERO).await;
        let mut ws = connect(&url).await;

        send(&mut ws, send_message("s1", "   ")).await;

        assert_eq!(
            next_event(&mut ws).await,
            json!({"type":"error","session_id":"s1","message":"message is empty"})
        );
    }

    #[tokio::test]
    async fn interrupt_stops_the_running_turn() {
        let (url, _) = start(vec![vec!["a", "never"]], Duration::from_millis(300)).await;
        let mut ws = connect(&url).await;

        send(&mut ws, send_message("s1", "go")).await;
        assert_eq!(next_event(&mut ws).await["type"], "turn_started");
        send(&mut ws, json!({ "type": "interrupt", "session_id": "s1" })).await;

        assert_eq!(
            next_event(&mut ws).await,
            json!({ "type": "interrupted", "session_id": "s1" })
        );
    }

    #[tokio::test]
    async fn interrupt_without_a_running_turn_sends_nothing() {
        let (url, _) = start(vec![vec!["ok"]], Duration::ZERO).await;
        let mut ws = connect(&url).await;

        send(&mut ws, json!({ "type": "interrupt", "session_id": "s1" })).await;
        send(&mut ws, send_message("s1", "hi")).await;

        assert_eq!(next_event(&mut ws).await["type"], "turn_started");
    }

    #[tokio::test]
    async fn revert_all_reports_the_reverted_files() {
        let (url, _) = start(vec![], Duration::ZERO).await;
        let mut ws = connect(&url).await;

        send(&mut ws, json!({ "type": "revert_all", "session_id": "s1" })).await;

        assert_eq!(
            next_event(&mut ws).await,
            json!({ "type": "changes_reverted", "session_id": "s1", "paths": [] })
        );
    }

    #[tokio::test]
    async fn revert_all_during_a_turn_returns_an_error_event() {
        let (url, _) = start(vec![vec!["a", "b"]], Duration::from_millis(300)).await;
        let mut ws = connect(&url).await;

        send(&mut ws, send_message("s1", "go")).await;
        assert_eq!(next_event(&mut ws).await["type"], "turn_started");
        send(&mut ws, json!({ "type": "revert_all", "session_id": "s1" })).await;

        assert_eq!(
            next_event(&mut ws).await,
            json!({
                "type": "error",
                "session_id": "s1",
                "message": "stop the running turn before reverting changes"
            })
        );
    }

    #[tokio::test]
    async fn tokens_reach_the_browser_within_200ms_of_model_emission() {
        let (url, emitted_at) = start(vec![vec!["a", "b", "c"]], Duration::from_millis(40)).await;
        let mut ws = connect(&url).await;

        send(&mut ws, send_message("s1", "hi")).await;
        let mut received_at = Vec::new();
        loop {
            let event = next_event(&mut ws).await;
            if event["type"] == "output" {
                received_at.push(Instant::now());
            }
            if event["type"] == "done" {
                break;
            }
        }

        let emitted_at = emitted_at.lock().unwrap();
        assert_eq!(received_at.len(), 3);
        for (sent, got) in emitted_at.iter().zip(&received_at) {
            let lag = got.duration_since(*sent);
            assert!(lag < Duration::from_millis(200), "lag {lag:?}");
        }
    }
}
