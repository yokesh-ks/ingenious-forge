//! The web_fetch tool (PRD §6.1 Built-in tools, ADR 0014): fetches a page
//! as text, only when the session's sandbox allows the network.

use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    sandbox::Policy,
    tools::{ToolBox, WEB_FETCH},
    Agent,
};
use api_types::{SessionEnvelope, SessionEvent};
use axum::{http::StatusCode, response::Html, routing::get, Router};
use serde_json::{json, Value};
use services::EventService;
use tokio::sync::{broadcast, mpsc};

#[derive(Default)]
struct FakeModel {
    replies: Mutex<VecDeque<Vec<ModelEvent>>>,
}

impl ModelClient for FakeModel {
    fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        let steps = self.replies.lock().unwrap().pop_front().unwrap_or_default();
        let (tx, rx) = mpsc::channel(16);
        tokio::spawn(async move {
            for step in steps {
                if tx.send(Ok(step)).await.is_err() {
                    return;
                }
            }
        });
        rx
    }
}

/// A local server with an HTML page, a text file and a missing page.
async fn serve() -> String {
    let app = Router::new()
        .route(
            "/page",
            get(|| async {
                Html("<html><body><h1>Release notes</h1><script>x()</script><p>Fixed &amp; shipped.</p></body></html>")
            }),
        )
        .route("/plain", get(|| async { "just text" }))
        .route("/gone", get(|| async { (StatusCode::NOT_FOUND, "no such page") }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

/// Runs one turn in which the model fetches `url`, with the network
/// allowed or not, and returns the tool result's text, error flag and meta.
async fn fetch(url: &str, network: bool) -> (String, bool, Option<Value>) {
    let root = std::env::temp_dir();
    let model = Arc::new(FakeModel {
        replies: Mutex::new(
            vec![
                vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                    id: "t1".into(),
                    name: WEB_FETCH.into(),
                    input: json!({ "url": url }),
                }])],
                vec![ModelEvent::TextDelta("ok".into())],
            ]
            .into(),
        ),
    });
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::new(model, events);
    agent.open_session("s1", ToolBox::new(&root));
    let mut policy = Policy::project(&root);
    policy.network = network;
    assert!(agent.set_sandbox_policy("s1", policy));

    agent.send_message("s1", "fetch").unwrap();
    result(&mut rx).await
}

async fn result(rx: &mut broadcast::Receiver<SessionEnvelope>) -> (String, bool, Option<Value>) {
    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("timed out waiting for the result")
            .unwrap()
            .event;
        if let SessionEvent::ToolResult {
            output,
            is_error,
            meta,
            started_at,
            ended_at,
            ..
        } = event
        {
            assert!(started_at > 0 && ended_at >= started_at);
            return (output, is_error, meta);
        }
    }
}

#[tokio::test]
async fn without_network_access_nothing_is_fetched() {
    let base = serve().await;
    let (output, is_error, meta) = fetch(&format!("{base}/page"), false).await;
    assert!(is_error);
    assert!(output.contains("Network access is off"), "{output}");
    assert!(meta.is_none());
}

#[tokio::test]
async fn an_html_page_comes_back_as_text_with_its_details() {
    let base = serve().await;
    let (output, is_error, meta) = fetch(&format!("{base}/page"), true).await;
    assert!(!is_error, "{output}");
    assert_eq!(output, "Release notes\n\nFixed & shipped.");
    let meta = meta.unwrap();
    assert_eq!(meta["status"], 200);
    assert!(meta["content_type"].as_str().unwrap().contains("html"));
}

#[tokio::test]
async fn plain_text_is_returned_as_is() {
    let base = serve().await;
    let (output, is_error, _) = fetch(&format!("{base}/plain"), true).await;
    assert!(!is_error);
    assert_eq!(output, "just text");
}

#[tokio::test]
async fn an_http_error_is_a_failed_result_with_its_status() {
    let base = serve().await;
    let (output, is_error, meta) = fetch(&format!("{base}/gone"), true).await;
    assert!(is_error);
    assert!(output.starts_with("HTTP 404"), "{output}");
    assert_eq!(meta.unwrap()["status"], 404);
}

#[tokio::test]
async fn only_http_urls_are_fetched() {
    let (output, is_error, _) = fetch("file:///etc/hosts", true).await;
    assert!(is_error);
    assert!(output.contains("only http and https"), "{output}");
    let (output, is_error, _) = fetch("not a url", true).await;
    assert!(is_error);
    assert!(output.contains("invalid URL"), "{output}");
}
