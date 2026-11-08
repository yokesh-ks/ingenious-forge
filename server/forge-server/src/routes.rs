use std::sync::Arc;

use agent::tools::ToolBox;
use api_types::{ClientMessage, SessionEvent, TitleSource};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
    routing::get,
    Router,
};
use tokio::sync::broadcast;

use crate::state::AppState;

/// The API and WebSocket routes, without the static SPA fallback.
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .nest(
            "/api",
            crate::projects::router()
                .merge(crate::settings::router())
                .merge(crate::github::router()),
        )
        .route("/ws", get(ws_handler))
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
                Some(Ok(Message::Text(text))) => handle_client_message(&state, &text).await,
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

/// Opens a session the agent has not seen since the server started, such as
/// one created before a restart.
pub(crate) async fn ensure_open(state: &AppState, session_id: &str) {
    if state.agent.is_open(session_id) {
        return;
    }
    let mode = match services::projects::get_session(&state.db, session_id).await {
        Ok(session) => session.approval_mode,
        Err(_) => return,
    };
    match services::projects::session_settings(&state.db, session_id).await {
        Ok(Some((folder, Some(model)))) => {
            let tools = ToolBox::new(folder);
            if let Err(err) =
                state
                    .agent
                    .open_session_with(session_id, tools.clone(), &(&model).into())
            {
                // The model is no longer offered: fall back to the default.
                tracing::warn!(%err, %session_id, "cannot open session with its model");
                state.agent.open_session(session_id, tools);
            }
        }
        Ok(Some((folder, None))) => state.agent.open_session(session_id, ToolBox::new(folder)),
        Ok(None) => {}
        Err(err) => tracing::warn!(%err, %session_id, "cannot look up session"),
    }
    state.agent.set_approval_mode(session_id, mode);
}

pub(crate) async fn handle_client_message(state: &AppState, text: &str) {
    let message = match serde_json::from_str::<ClientMessage>(text) {
        Ok(message) => message,
        Err(err) => {
            tracing::warn!(%err, "ignoring malformed client message");
            return;
        }
    };
    match message {
        ClientMessage::SendMessage { session_id, text } => {
            ensure_open(state, &session_id).await;
            // Record first so the title is in place when the sidebar
            // refreshes on `turn_started`.
            let title =
                match services::projects::record_message(&state.db, &session_id, &text).await {
                    Ok(title) => title,
                    Err(err) => {
                        tracing::warn!(%err, %session_id, "cannot record session activity");
                        None
                    }
                };
            if let Err(err) = state.agent.send_message(&session_id, &text) {
                state.events.publish(SessionEvent::Error {
                    session_id: session_id.clone(),
                    message: err.to_string(),
                });
            }
            // Logged after the message, so the browser sees its message
            // echoed first.
            if let Some(title) = title {
                state.events.publish(SessionEvent::SessionTitle {
                    session_id,
                    title,
                    source: TitleSource::FirstMessage,
                });
            }
        }
        ClientMessage::RevertAll { session_id } => {
            ensure_open(state, &session_id).await;
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
        ClientMessage::AnswerApproval {
            session_id,
            call_id,
            decision,
        } => {
            if !state.agent.answer_approval(&session_id, &call_id, decision) {
                tracing::debug!(%session_id, %call_id, "no approval card waiting");
            }
        }
        ClientMessage::AnswerQuestion {
            session_id,
            call_id,
            answers,
        } => {
            if !state.agent.answer_question(&session_id, &call_id, answers) {
                tracing::debug!(%session_id, %call_id, "no matching question card waiting");
            }
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
        let agent = Agent::new(Arc::new(model), events.clone());
        agent.open_session("s1", ToolBox::new(std::env::temp_dir()));
        let state = Arc::new(AppState {
            db: db::connect(":memory:").await.unwrap(),
            agent,
            events,
            terminals: Default::default(),
            settings: Default::default(),
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
                let mut value: Value = serde_json::from_str(&text).unwrap();
                // Sequence numbers, the echoed user message, step
                // boundaries and step records have their own tests.
                if [
                    "user_message",
                    "step_started",
                    "step_ended",
                    "reasoning_delta",
                    "assistant_message",
                    "assistant_attempt",
                    "request_header",
                    "request_context",
                    "system_prompt",
                    "model_changed",
                    "session_title",
                ]
                .contains(&value["type"].as_str().unwrap_or_default())
                {
                    continue;
                }
                let fields = value.as_object_mut().unwrap();
                fields.remove("seq");
                let ts = fields.remove("ts").and_then(|ts| ts.as_u64());
                assert!(
                    ts.is_some_and(|ts| ts > 0),
                    "every frame carries a timestamp"
                );
                return value;
            }
        }
    }

    async fn until_end(ws: &mut Ws) -> Vec<Value> {
        let mut out = Vec::new();
        loop {
            let event = next_event(ws).await;
            let end = event["type"] == "turn_ended" || event["type"] == "error";
            out.push(event);
            if end {
                return out;
            }
        }
    }

    fn send_message(session_id: &str, text: &str) -> Value {
        json!({ "type": "send_message", "session_id": session_id, "text": text })
    }

    /// Asks to run `true`, then replies "ok".
    struct ShellModel(Mutex<VecDeque<Vec<ModelEvent>>>);

    impl ModelClient for ShellModel {
        fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
            let steps = self.0.lock().unwrap().pop_front().unwrap_or_default();
            let (tx, rx) = mpsc::channel(4);
            tokio::spawn(async move {
                for step in steps {
                    let _ = tx.send(Ok(step)).await;
                }
            });
            rx
        }
    }

    #[tokio::test]
    async fn an_approval_card_is_answered_over_the_socket() {
        use agent::model::ContentBlock;
        let model = ShellModel(Mutex::new(
            vec![
                vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                    id: "t1".into(),
                    name: "bash".into(),
                    input: json!({ "command": "true" }),
                }])],
                vec![ModelEvent::TextDelta("ok".into())],
            ]
            .into(),
        ));
        let events = EventService::new();
        let agent = Agent::new(Arc::new(model), events.clone());
        agent.open_session("s1", ToolBox::new(std::env::temp_dir()));
        agent.set_approval_mode("s1", api_types::ApprovalMode::Ask);
        let state = Arc::new(AppState {
            db: db::connect(":memory:").await.unwrap(),
            agent,
            events,
            terminals: Default::default(),
            settings: Default::default(),
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router().with_state(state))
                .await
                .unwrap();
        });
        let mut ws = connect(&format!("ws://{addr}/ws")).await;

        send(&mut ws, send_message("s1", "run")).await;
        loop {
            if next_event(&mut ws).await["type"] == "approval_requested" {
                break;
            }
        }
        send(
            &mut ws,
            json!({ "type": "answer_approval", "session_id": "s1", "call_id": "t1", "decision": "approve" }),
        )
        .await;
        let rest = until_end(&mut ws).await;

        assert_eq!(rest[0]["type"], "approval_resolved");
        assert_eq!(rest[0]["decision"], "approve");
        let result = rest.iter().find(|e| e["type"] == "tool_result").unwrap();
        assert_eq!(result["exit_code"], 0);
        assert_eq!(rest.last().unwrap()["reason"]["kind"], "completed");
    }

    #[tokio::test]
    async fn sending_a_message_streams_the_turn_back() {
        let (url, _) = start(vec![vec!["Hel", "lo"]], Duration::ZERO).await;
        let mut ws = connect(&url).await;

        send(&mut ws, send_message("s1", "hi")).await;

        assert_eq!(
            until_end(&mut ws).await,
            vec![
                json!({"type":"turn_started","session_id":"s1","turn":1}),
                json!({"type":"output","session_id":"s1","chunk":"Hel"}),
                json!({"type":"output","session_id":"s1","chunk":"lo"}),
                json!({"type":"turn_ended","session_id":"s1","turn":1,"reason":{"kind":"completed"}}),
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
            json!({
                "type": "turn_ended",
                "session_id": "s1",
                "turn": 1,
                "reason": { "kind": "interrupted" }
            })
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
    async fn a_message_for_an_unknown_session_returns_an_error_event() {
        let (url, _) = start(vec![], Duration::ZERO).await;
        let mut ws = connect(&url).await;

        send(&mut ws, send_message("ghost", "hi")).await;

        assert_eq!(
            next_event(&mut ws).await,
            json!({ "type": "error", "session_id": "ghost", "message": "this session is not open" })
        );
    }

    #[tokio::test]
    async fn the_accepted_message_is_echoed_first() {
        let (url, _) = start(vec![vec!["a"]], Duration::ZERO).await;
        let mut ws = connect(&url).await;
        send(&mut ws, send_message("s1", "  hi  ")).await;

        let msg = tokio::time::timeout(Duration::from_secs(2), ws.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let WsMessage::Text(text) = msg else {
            panic!("expected text")
        };
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value.as_object_mut().unwrap().remove("ts");
        assert_eq!(
            value,
            json!({ "seq": 1, "type": "user_message", "session_id": "s1", "text": "hi", "source": "human" })
        );
    }

    #[tokio::test]
    async fn every_frame_carries_the_session_sequence_number() {
        let (url, _) = start(vec![vec!["a"]], Duration::ZERO).await;
        let mut ws = connect(&url).await;
        send(&mut ws, send_message("s1", "hi")).await;

        let mut seqs = Vec::new();
        loop {
            let msg = tokio::time::timeout(Duration::from_secs(2), ws.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            let WsMessage::Text(text) = msg else { continue };
            let value: Value = serde_json::from_str(&text).unwrap();
            seqs.push((value["seq"].as_u64().unwrap(), value["type"].clone()));
            if value["type"] == "turn_ended" {
                break;
            }
        }
        // Every frame is numbered, from 1 and without gaps.
        let numbers: Vec<u64> = seqs.iter().map(|(seq, _)| *seq).collect();
        assert_eq!(numbers, (1..=seqs.len() as u64).collect::<Vec<_>>());
        let main: Vec<_> = seqs
            .iter()
            .map(|(_, kind)| kind.as_str().unwrap())
            .filter(|kind| {
                [
                    "user_message",
                    "turn_started",
                    "step_started",
                    "request_header",
                    "output",
                    "assistant_message",
                    "step_ended",
                    "turn_ended",
                ]
                .contains(kind)
            })
            .collect();
        assert_eq!(
            main,
            [
                "user_message",
                "turn_started",
                "step_started",
                "request_header",
                "output",
                "assistant_message",
                "step_ended",
                "turn_ended"
            ]
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
            if event["type"] == "turn_ended" {
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
