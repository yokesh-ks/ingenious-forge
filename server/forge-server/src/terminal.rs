//! The project terminal socket (PRD §6.2 Workspace panel; ADR 0007):
//! output goes out as binary frames, input and resizes come in as JSON.

use std::sync::Arc;

use api_types::{TerminalInput, TerminalNotice};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::Response,
};
use serde::Deserialize;
use services::{projects, terminal::TermEvent};
use tokio::sync::broadcast::error::RecvError;

use crate::{projects::ApiFailure, state::AppState};

/// Which terminal of a project a request means: a workspace panel tab's
/// own, or the project's single one when it names no tab.
#[derive(Deserialize)]
pub struct TerminalTab {
    tab: Option<String>,
}

const TAB_MAX: usize = 64;

/// The registry key for a project's terminal; a tab name is limited to
/// characters that cannot collide with the `project:tab` separator.
fn terminal_key(project: &str, tab: Option<&str>) -> Result<String, ApiFailure> {
    let Some(tab) = tab else {
        return Ok(project.to_string());
    };
    let valid = !tab.is_empty()
        && tab.len() <= TAB_MAX
        && tab.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !valid {
        return Err(ApiFailure::new(
            StatusCode::BAD_REQUEST,
            "the terminal tab name is not valid",
        ));
    }
    Ok(format!("{project}:{tab}"))
}

/// Opens (or rejoins) a terminal of project `id`.
pub async fn terminal_socket(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<TerminalTab>,
) -> Result<Response, ApiFailure> {
    let project = projects::get_project(&state.db, &id).await?;
    let key = terminal_key(&project.id, query.tab.as_deref())?;
    let terminals = state.terminals.clone();
    let attached = tokio::task::spawn_blocking(move || {
        terminals.attach(&key, std::path::Path::new(&project.path))
    })
    .await
    .map_err(|e| ApiFailure::internal(e.to_string()))?
    .map_err(ApiFailure::internal)?;
    Ok(ws.on_upgrade(move |socket| serve(socket, attached)))
}

/// Forgets a terminal when its tab closes; its shell ends once no browser
/// is attached.
pub async fn close_terminal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<TerminalTab>,
) -> Result<StatusCode, ApiFailure> {
    let project = projects::get_project(&state.db, &id).await?;
    state
        .terminals
        .close(&terminal_key(&project.id, query.tab.as_deref())?);
    Ok(StatusCode::NO_CONTENT)
}

async fn serve(mut socket: WebSocket, attached: services::terminal::Attached) {
    let services::terminal::Attached {
        terminal,
        scrollback,
        mut events,
    } = attached;
    if !scrollback.is_empty()
        && socket
            .send(Message::Binary(scrollback.into()))
            .await
            .is_err()
    {
        return;
    }
    loop {
        tokio::select! {
            event = events.recv() => match event {
                Ok(TermEvent::Output(bytes)) => {
                    if socket.send(Message::Binary(bytes.into())).await.is_err() {
                        return;
                    }
                }
                Ok(TermEvent::Exit) | Err(RecvError::Closed) => {
                    let notice = serde_json::to_string(&TerminalNotice::Exit).unwrap_or_default();
                    let _ = socket.send(Message::Text(notice.into())).await;
                    return;
                }
                // A slow browser misses some output rather than stalling.
                Err(RecvError::Lagged(_)) => {}
            },
            message = socket.recv() => match message {
                Some(Ok(Message::Text(text))) => match serde_json::from_str(&text) {
                    Ok(TerminalInput::Input { data }) => {
                        let terminal = terminal.clone();
                        let _ = tokio::task::spawn_blocking(move || terminal.write(data.as_bytes())).await;
                    }
                    Ok(TerminalInput::Resize { cols, rows }) => {
                        let _ = terminal.resize(cols, rows);
                    }
                    Err(err) => tracing::warn!(%err, "ignoring malformed terminal message"),
                },
                Some(Ok(_)) => {}
                // The browser left; the shell keeps running for its return.
                Some(Err(_)) | None => return,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    #[test]
    fn a_tab_gets_its_own_key_and_no_tab_keeps_the_projects() {
        assert_eq!(super::terminal_key("p1", None).ok().as_deref(), Some("p1"));
        assert_eq!(
            super::terminal_key("p1", Some("terminal-2"))
                .ok()
                .as_deref(),
            Some("p1:terminal-2")
        );
    }

    #[test]
    fn a_malformed_tab_name_is_refused() {
        for tab in ["", "a:b", "../x", "a b", &"x".repeat(65)] {
            assert!(super::terminal_key("p1", Some(tab)).is_err(), "{tab:?}");
        }
    }

    use agent::Agent;
    use axum::Router;
    use futures_util::{SinkExt, StreamExt};
    use serde_json::json;
    use services::{terminal::Terminals, EventService};
    use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

    use super::*;

    struct NoModel;
    impl agent::model::ModelClient for NoModel {
        fn stream(
            &self,
            _: agent::model::ModelRequest,
        ) -> tokio::sync::mpsc::Receiver<Result<agent::model::ModelEvent, agent::model::ModelError>>
        {
            tokio::sync::mpsc::channel(1).1
        }
    }

    async fn start() -> (String, String) {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static N: AtomicUsize = AtomicUsize::new(0);
        let repo = std::env::temp_dir().join(format!(
            "forge-term-ws-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(repo.join(".git")).unwrap();
        let db = db::connect(":memory:").await.unwrap();
        let project = projects::open_project(&db, repo.to_str().unwrap())
            .await
            .unwrap();
        let events = EventService::new();
        let state = Arc::new(AppState {
            db,
            agent: Agent::new(Arc::new(NoModel), events.clone()),
            events,
            terminals: Terminals::with_shell("/bin/sh"),
            settings: Default::default(),
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .nest("/api", crate::projects::router())
            .with_state(state);
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("ws://{addr}/api/projects"), project.id)
    }

    type Ws = tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >;

    async fn read_until(ws: &mut Ws, needle: &str) -> String {
        let mut seen = String::new();
        while !seen.contains(needle) {
            let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
                .await
                .unwrap_or_else(|_| panic!("no {needle:?} in {seen:?}"))
                .unwrap()
                .unwrap();
            if let WsMessage::Binary(bytes) = msg {
                seen.push_str(&String::from_utf8_lossy(&bytes));
            }
        }
        seen
    }

    async fn input(ws: &mut Ws, data: &str) {
        let frame = json!({ "type": "input", "data": data }).to_string();
        ws.send(WsMessage::text(frame)).await.unwrap();
    }

    #[tokio::test]
    async fn typing_runs_commands_and_the_shell_survives_a_reconnect() {
        let (base, id) = start().await;
        let (mut ws, _) = connect_async(format!("{base}/{id}/terminal"))
            .await
            .unwrap();
        input(&mut ws, "echo first-$((1+1))\n").await;
        read_until(&mut ws, "first-2").await;
        ws.close(None).await.unwrap();

        // Coming back replays the recent output, then the same shell runs on.
        let (mut ws, _) = connect_async(format!("{base}/{id}/terminal"))
            .await
            .unwrap();
        read_until(&mut ws, "first-2").await;
        input(&mut ws, "echo second-$((2+2))\n").await;
        read_until(&mut ws, "second-4").await;
    }

    #[tokio::test]
    async fn the_browser_is_told_when_the_shell_exits() {
        let (base, id) = start().await;
        let (mut ws, _) = connect_async(format!("{base}/{id}/terminal"))
            .await
            .unwrap();
        input(&mut ws, "exit\n").await;
        loop {
            let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            if let WsMessage::Text(text) = msg {
                assert_eq!(text.as_str(), r#"{"type":"exit"}"#);
                break;
            }
        }
    }

    #[tokio::test]
    async fn an_unknown_project_has_no_terminal() {
        let (base, _) = start().await;
        assert!(connect_async(format!("{base}/nope/terminal"))
            .await
            .is_err());
    }
}
