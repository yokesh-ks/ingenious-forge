//! Runs the OpenAI-compatible adapter against a local stand-in for a provider,
//! so its HTTP and streaming are exercised without a network call.

use std::sync::{Arc, Mutex};

use agent::model::{ChatMessage, ContentBlock, ModelError, ModelEvent, ModelRequest};
use agent::openai_compat::{OpenAiCompatProvider, PROVIDERS};
use agent::providers::{ModelProvider, Providers};
use api_types::ReasoningEffort;
use axum::{
    body::Body,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::post,
    Router,
};

#[derive(Default, Clone)]
struct Seen {
    headers: Arc<Mutex<Option<HeaderMap>>>,
    body: Arc<Mutex<Option<serde_json::Value>>>,
}

async fn serve(status: StatusCode, body: &'static str) -> (String, Seen) {
    let seen = Seen::default();
    let s = seen.clone();
    let app = Router::new().route(
        "/v1/chat/completions",
        post(move |headers: HeaderMap, raw: String| {
            let s = s.clone();
            async move {
                *s.headers.lock().unwrap() = Some(headers);
                *s.body.lock().unwrap() = serde_json::from_str(&raw).ok();
                Response::builder()
                    .status(status)
                    .header("content-type", "text/event-stream")
                    .body(Body::from(body))
                    .unwrap()
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}/v1"), seen)
}

fn nvidia(key: Option<&str>, url: &str) -> OpenAiCompatProvider {
    let spec = PROVIDERS.iter().find(|p| p.id == "nvidia").unwrap();
    OpenAiCompatProvider::new(spec, key.map(String::from)).with_base_url(url)
}

fn request() -> ModelRequest {
    ModelRequest {
        messages: vec![ChatMessage::user_text("Say hi")],
        tools: vec![],
        system: None,
        effort: Some(ReasoningEffort::Low),
        max_tokens: None,
    }
}

const STREAM: &str = "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n\
data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n\
data: {\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":\"stop\"}]}\n\n\
data: [DONE]\n\n";

async fn collect(provider: &OpenAiCompatProvider) -> Vec<Result<ModelEvent, ModelError>> {
    let model = &provider.models()[0].id;
    let mut rx = provider.client(model).stream(request());
    let mut events = Vec::new();
    while let Some(event) = rx.recv().await {
        events.push(event);
    }
    events
}

#[tokio::test]
async fn a_reply_streams_with_the_key_model_and_effort_sent() {
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let provider = nvidia(Some("nv-key"), &url);

    assert_eq!(
        collect(&provider).await,
        vec![
            Ok(ModelEvent::TextDelta("Hel".into())),
            Ok(ModelEvent::TextDelta("lo".into())),
            Ok(ModelEvent::Message(vec![ContentBlock::Text {
                text: "Hello".into()
            }])),
        ]
    );
    let headers = seen.headers.lock().unwrap().clone().unwrap();
    assert_eq!(headers["authorization"], "Bearer nv-key");
    let body = seen.body.lock().unwrap().clone().unwrap();
    assert_eq!(body["model"], "minimaxai/minimax-m3.1-flash");
    assert_eq!(body["reasoning_effort"], "low");
    assert_eq!(body["max_tokens"], 64_000);
    assert_eq!(body["messages"][0]["content"], "Say hi");
}

#[tokio::test]
async fn a_rejected_key_reports_the_providers_reason() {
    let (url, _) = serve(StatusCode::UNAUTHORIZED, r#"{"detail":"Bad token"}"#).await;
    let provider = nvidia(Some("bad"), &url);
    assert_eq!(
        collect(&provider).await,
        vec![Err(ModelError::Api {
            status: 401,
            message: "Bad token".into()
        })]
    );
}

#[tokio::test]
async fn no_key_makes_no_request_and_names_the_provider() {
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let provider = nvidia(None, &url);

    let events = collect(&provider).await;

    assert_eq!(
        events,
        vec![Err(ModelError::MissingApiKey {
            provider: "NVIDIA".into()
        })]
    );
    assert!(seen.headers.lock().unwrap().is_none());
    assert!(!provider.is_configured());
}

#[tokio::test]
async fn an_open_client_follows_the_key_in_settings() {
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let provider = nvidia(Some("old"), &url);
    let client = provider.client(&provider.models()[0].id);

    *provider.key_handle().write().unwrap() = Some("new".into());
    let mut rx = client.stream(request());
    while rx.recv().await.is_some() {}

    let headers = seen.headers.lock().unwrap().clone().unwrap();
    assert_eq!(headers["authorization"], "Bearer new");
}

#[tokio::test]
async fn its_key_can_be_tested_like_any_providers() {
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let mut providers = Providers::new();
    providers.register(Arc::new(nvidia(Some("nv-key"), &url)));

    providers.test_key("nvidia").await.unwrap();

    let body = seen.body.lock().unwrap().clone().unwrap();
    assert_eq!(body["max_tokens"], 1);
    assert!(body.get("reasoning_effort").is_none());
}

#[tokio::test]
async fn each_model_offers_its_own_efforts_in_the_catalog() {
    use ReasoningEffort::{High, Max, Medium};
    let mut providers = Providers::new();
    providers.register(Arc::new(nvidia(Some("k"), "http://unused")));

    let catalog = providers.catalog();
    let models = &catalog.providers[0].models;
    let efforts = |id: &str| {
        models
            .iter()
            .find(|m| m.id == id)
            .unwrap()
            .efforts
            .as_slice()
    };

    assert_eq!(efforts("z-ai/glm-5.3-flash")[1..], [High, Max]);
    assert_eq!(efforts("nvidia/nemotron-3-ultra-550b-a55b"), [Medium, High]);
    assert!(efforts("nvidia/nemotron-3.5-lightning-30b-a3b").is_empty());
}

/// A stand-in that answers each request with the next reply and keeps every
/// request body.
async fn serve_script(replies: Vec<&'static str>) -> (String, Arc<Mutex<Vec<serde_json::Value>>>) {
    let bodies = Arc::new(Mutex::new(Vec::new()));
    let recorded = bodies.clone();
    let replies = Arc::new(Mutex::new(replies.into_iter()));
    let app = Router::new().route(
        "/v1/chat/completions",
        post(move |raw: String| {
            let recorded = recorded.clone();
            let replies = replies.clone();
            async move {
                recorded
                    .lock()
                    .unwrap()
                    .push(serde_json::from_str::<serde_json::Value>(&raw).unwrap());
                let reply = replies
                    .lock()
                    .unwrap()
                    .next()
                    .expect("an unexpected request");
                Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "text/event-stream")
                    .body(Body::from(reply))
                    .unwrap()
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}/v1"), bodies)
}

const CALLS_EDIT: &str = "data: {\"choices\":[{\"delta\":{\"content\":\"Editing.\"}}]}\n\n\
data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"name\":\"edit_file\",\"arguments\":\"\"}}]}}]}\n\n\
data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"path\\\":\\\"a.txt\\\",\"}}]}}]}\n\n\
data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"old_string\\\":\\\"old\\\",\\\"new_string\\\":\\\"new\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n\
data: [DONE]\n\n";

const FINISHES: &str = "data: {\"choices\":[{\"delta\":{\"content\":\"Done.\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";

/// Runs a turn on NVIDIA that edits a.txt, answering its approval card with
/// `decision`. Returns the folder and the request bodies sent.
async fn edit_on_nvidia(
    decision: api_types::ApprovalDecision,
) -> (std::path::PathBuf, Vec<serde_json::Value>) {
    use agent::{providers::ModelChoice, tools::ToolBox, Agent};
    use api_types::{ApprovalMode, SessionEvent};
    use std::time::Duration;

    let dir = std::env::temp_dir().join(format!(
        "forge-nvidia-{}-{:?}",
        std::process::id(),
        decision
    ));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("a.txt"), "old").unwrap();

    let (url, bodies) = serve_script(vec![CALLS_EDIT, FINISHES]).await;
    let mut providers = Providers::new();
    providers.register(Arc::new(nvidia(Some("nv-key"), &url)));
    let events = services::EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::with_providers(providers, events);
    let pick = ModelChoice {
        provider: "nvidia".into(),
        model: "minimaxai/minimax-m3.1-flash".into(),
        effort: Some(ReasoningEffort::High),
    };
    agent
        .open_session_with("s", ToolBox::new(&dir), &pick)
        .unwrap();
    assert!(agent.set_approval_mode("s", ApprovalMode::Ask));

    agent.send_message("s", "Change old to new").unwrap();

    let mut text = String::new();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .event;
        match event {
            SessionEvent::ApprovalRequested { call_id, path, .. } => {
                assert_eq!(call_id, "call-1");
                assert_eq!(path.as_deref(), Some("a.txt"));
                // The file waits for the answer.
                assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "old");
                assert!(agent.answer_approval("s", &call_id, decision));
            }
            SessionEvent::Output { chunk, .. } => text.push_str(&chunk),
            SessionEvent::Done { .. } => break,
            SessionEvent::Error { message, .. } => panic!("{message}"),
            _ => {}
        }
    }
    assert!(text.ends_with("Done."), "{text}");
    let bodies = bodies.lock().unwrap().clone();
    (dir, bodies)
}

#[tokio::test]
async fn an_approved_edit_runs_and_its_result_goes_back_to_the_model() {
    let (dir, bodies) = edit_on_nvidia(api_types::ApprovalDecision::Approve).await;

    assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "new");
    assert_eq!(bodies.len(), 2);
    assert!(bodies[0]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["function"]["name"] == "edit_file"));
    assert_eq!(bodies[0]["reasoning_effort"], "high");

    let messages = bodies[1]["messages"].as_array().unwrap();
    let assistant = messages
        .iter()
        .find(|m| m["role"] == "assistant")
        .expect("the assistant's tool call is replayed");
    let call = &assistant["tool_calls"][0];
    assert_eq!(call["id"], "call-1");
    assert_eq!(call["function"]["name"], "edit_file");
    let arguments: serde_json::Value =
        serde_json::from_str(call["function"]["arguments"].as_str().unwrap()).unwrap();
    assert_eq!(arguments["new_string"], "new");
    let result = messages.last().unwrap();
    assert_eq!(result["role"], "tool");
    assert_eq!(result["tool_call_id"], "call-1");
    assert!(!result["content"].as_str().unwrap().starts_with("Error:"));
}

#[tokio::test]
async fn a_denied_edit_leaves_the_file_and_tells_the_model() {
    let (dir, bodies) = edit_on_nvidia(api_types::ApprovalDecision::Deny).await;

    assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "old");
    let messages = bodies[1]["messages"].as_array().unwrap();
    let result = messages.last().unwrap();
    assert_eq!(result["role"], "tool");
    assert_eq!(result["tool_call_id"], "call-1");
}
