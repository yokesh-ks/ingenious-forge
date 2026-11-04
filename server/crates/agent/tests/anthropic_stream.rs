//! Runs the Anthropic adapter against a local stand-in for the Messages
//! API, so the HTTP and SSE handling is exercised without a network call.

use std::sync::{Arc, Mutex};

use agent::anthropic::AnthropicClient;
use agent::model::{ChatMessage, ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest};
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
        "/v1/messages",
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
    (format!("http://{addr}"), seen)
}

fn request() -> ModelRequest {
    ModelRequest {
        messages: vec![ChatMessage::user_text("Say hi")],
        tools: vec![],
        system: None,
        effort: None,
    }
}

async fn collect(client: &AnthropicClient) -> Vec<Result<ModelEvent, ModelError>> {
    let mut rx = client.stream(request());
    let mut out = Vec::new();
    while let Some(item) = rx.recv().await {
        out.push(item);
    }
    out
}

const STREAM: &str = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n\
event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n\
event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi \"}}\n\n\
event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"there\"}}\n\n\
event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

#[tokio::test]
async fn streams_text_deltas_in_order() {
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let client = AnthropicClient::new(Some("test-key".into())).with_base_url(url);

    let events = collect(&client).await;

    assert_eq!(
        events,
        vec![
            Ok(ModelEvent::TextDelta("Hi ".into())),
            Ok(ModelEvent::TextDelta("there".into())),
            Ok(ModelEvent::Message(vec![ContentBlock::Text {
                text: "Hi there".into()
            }])),
        ]
    );
    let headers = seen.headers.lock().unwrap().clone().unwrap();
    assert_eq!(headers["x-api-key"], "test-key");
    assert_eq!(headers["anthropic-version"], "2026-10-21");
    let body = seen.body.lock().unwrap().clone().unwrap();
    assert_eq!(body["messages"][0]["content"][0]["text"], "Say hi");
}

#[tokio::test]
async fn http_error_status_is_reported_with_api_message() {
    let (url, _) = serve(
        StatusCode::UNAUTHORIZED,
        "{\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"invalid x-api-key\"}}",
    )
    .await;
    let client = AnthropicClient::new(Some("bad".into())).with_base_url(url);

    let events = collect(&client).await;

    assert_eq!(
        events,
        vec![Err(ModelError::Api {
            status: 401,
            message: "invalid x-api-key".into()
        })]
    );
}

#[tokio::test]
async fn missing_api_key_fails_without_a_request() {
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let client = AnthropicClient::new(None).with_base_url(url);

    assert_eq!(collect(&client).await, vec![Err(ModelError::MissingApiKey)]);
    assert!(seen.headers.lock().unwrap().is_none());
}

#[tokio::test]
async fn unreachable_server_is_a_request_error() {
    let client = AnthropicClient::new(Some("k".into())).with_base_url("http://127.0.0.1:1");
    let events = collect(&client).await;
    assert!(matches!(events.as_slice(), [Err(ModelError::Request(_))]));
}

#[tokio::test]
async fn stream_stops_after_an_error_event() {
    let (url, _) = serve(
        StatusCode::OK,
        "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n\
event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"late\"}}\n\n",
    )
    .await;
    let client = AnthropicClient::new(Some("k".into())).with_base_url(url);
    assert_eq!(
        collect(&client).await,
        vec![Err(ModelError::Stream("Overloaded".into()))]
    );
}

#[tokio::test]
async fn the_provider_builds_a_client_for_the_chosen_model() {
    use agent::{anthropic::AnthropicProvider, providers::ModelProvider};
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let provider = AnthropicProvider::new(Some("test-key".into())).with_base_url(url);

    let client = provider.client("claude-sonnet-5-5");
    let mut rx = client.stream(request());
    while rx.recv().await.is_some() {}

    let body = seen.body.lock().unwrap().clone().unwrap();
    assert_eq!(body["model"], "claude-sonnet-5-5");
    let headers = seen.headers.lock().unwrap().clone().unwrap();
    assert_eq!(headers["x-api-key"], "test-key");
}

#[tokio::test]
async fn a_key_changed_through_the_handle_is_used_by_new_clients() {
    use agent::{anthropic::AnthropicProvider, providers::ModelProvider};
    let (url, seen) = serve(StatusCode::OK, STREAM).await;
    let provider = AnthropicProvider::new(None).with_base_url(url);

    let mut rx = provider.client("claude-opus-5-5").stream(request());
    assert_eq!(rx.recv().await, Some(Err(ModelError::MissingApiKey)));

    *provider.key_handle().write().unwrap() = Some("from-settings".into());
    let mut rx = provider.client("claude-opus-5-5").stream(request());
    while rx.recv().await.is_some() {}
    let headers = seen.headers.lock().unwrap().clone().unwrap();
    assert_eq!(headers["x-api-key"], "from-settings");
}
