//! Anthropic Messages API adapter: streams a reply over server-sent events
//! and maps it onto [`ModelEvent`]s.

use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::model::{ModelClient, ModelError, ModelEvent, ModelRequest};
use crate::sse::{SseEvent, SseParser};

pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";
const API_VERSION: &str = "2026-10-21";
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const MAX_TOKENS: u32 = 64_000;

#[derive(Debug, Clone)]
pub struct AnthropicClient {
    http: reqwest::Client,
    base_url: String,
    api_key: Option<String>,
    model: String,
}

impl AnthropicClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: DEFAULT_BASE_URL.into(),
            api_key: api_key.filter(|k| !k.trim().is_empty()),
            model: DEFAULT_MODEL.into(),
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }
}

pub(crate) fn request_body(model: &str, request: &ModelRequest) -> Value {
    json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "stream": true,
        "fallbacks": "default",
        "messages": request.messages,
    })
}

/// Maps one SSE event to a model event. `Ok(None)` means the event carries
/// nothing the agent needs (pings, block boundaries, thinking).
pub(crate) fn parse_event(event: &SseEvent) -> Result<Option<ModelEvent>, ModelError> {
    let data: Value =
        serde_json::from_str(&event.data).map_err(|e| ModelError::Stream(e.to_string()))?;
    match data["type"].as_str() {
        Some("content_block_delta") if data["delta"]["type"] == "text_delta" => Ok(Some(
            ModelEvent::TextDelta(data["delta"]["text"].as_str().unwrap_or_default().into()),
        )),
        Some("message_delta") if data["delta"]["stop_reason"] == "refusal" => {
            Err(ModelError::Refusal)
        }
        Some("error") => Err(ModelError::Stream(error_message(&data))),
        _ => Ok(None),
    }
}

fn error_message(data: &Value) -> String {
    data["error"]["message"]
        .as_str()
        .unwrap_or("unknown error")
        .to_string()
}

impl AnthropicClient {
    async fn run(
        &self,
        request: ModelRequest,
        tx: &mpsc::Sender<Result<ModelEvent, ModelError>>,
    ) -> Result<(), ModelError> {
        let api_key = self.api_key.as_deref().ok_or(ModelError::MissingApiKey)?;
        let mut response = self
            .http
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", API_VERSION)
            .header("anthropic-beta", FALLBACK_BETA)
            .json(&request_body(&self.model, &request))
            .send()
            .await
            .map_err(|e| ModelError::Request(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let message = serde_json::from_str::<Value>(&body)
                .map(|v| error_message(&v))
                .unwrap_or(body);
            return Err(ModelError::Api {
                status: status.as_u16(),
                message,
            });
        }

        let mut parser = SseParser::default();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| ModelError::Stream(e.to_string()))?
        {
            for event in parser.push(&chunk) {
                if let Some(model_event) = parse_event(&event)? {
                    if tx.send(Ok(model_event)).await.is_err() {
                        // The turn was dropped; stop reading the stream.
                        return Ok(());
                    }
                }
            }
        }
        Ok(())
    }
}

impl ModelClient for AnthropicClient {
    fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        let (tx, rx) = mpsc::channel(64);
        let client = self.clone();
        tokio::spawn(async move {
            if let Err(err) = client.run(request, &tx).await {
                let _ = tx.send(Err(err)).await;
            }
        });
        rx
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ChatMessage, Role};

    fn sse(event: &str, data: Value) -> SseEvent {
        SseEvent {
            event: event.into(),
            data: data.to_string(),
        }
    }

    #[test]
    fn text_delta_becomes_model_text() {
        let e = sse(
            "content_block_delta",
            json!({"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}),
        );
        assert_eq!(
            parse_event(&e),
            Ok(Some(ModelEvent::TextDelta("Hel".into())))
        );
    }

    #[test]
    fn thinking_and_bookkeeping_events_are_ignored() {
        for e in [
            sse(
                "message_start",
                json!({"type":"message_start","message":{}}),
            ),
            sse("ping", json!({"type":"ping"})),
            sse(
                "content_block_start",
                json!({"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}),
            ),
            sse(
                "content_block_delta",
                json!({"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}),
            ),
            sse(
                "message_delta",
                json!({"type":"message_delta","delta":{"stop_reason":"end_turn"}}),
            ),
            sse("message_stop", json!({"type":"message_stop"})),
        ] {
            assert_eq!(parse_event(&e), Ok(None), "{}", e.data);
        }
    }

    #[test]
    fn error_event_is_a_stream_error() {
        let e = sse(
            "error",
            json!({"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}),
        );
        assert_eq!(
            parse_event(&e),
            Err(ModelError::Stream("Overloaded".into()))
        );
    }

    #[test]
    fn refusal_stop_reason_is_reported() {
        let e = sse(
            "message_delta",
            json!({"type":"message_delta","delta":{"stop_reason":"refusal"}}),
        );
        assert_eq!(parse_event(&e), Err(ModelError::Refusal));
    }

    #[test]
    fn malformed_json_is_a_stream_error() {
        let e = SseEvent {
            event: "content_block_delta".into(),
            data: "{not json".into(),
        };
        assert!(matches!(parse_event(&e), Err(ModelError::Stream(_))));
    }

    #[test]
    fn request_body_streams_the_conversation() {
        let req = ModelRequest {
            messages: vec![
                ChatMessage {
                    role: Role::User,
                    content: "hi".into(),
                },
                ChatMessage {
                    role: Role::Assistant,
                    content: "hello".into(),
                },
                ChatMessage {
                    role: Role::User,
                    content: "again".into(),
                },
            ],
        };
        let body = request_body("claude-opus-5-5", &req);
        assert_eq!(body["model"], "claude-opus-5-5");
        assert_eq!(body["stream"], true);
        assert_eq!(body["max_tokens"], MAX_TOKENS);
        assert_eq!(body["fallbacks"], "default");
        assert_eq!(
            body["messages"],
            json!([
                {"role":"user","content":"hi"},
                {"role":"assistant","content":"hello"},
                {"role":"user","content":"again"}
            ])
        );
    }

    #[test]
    fn blank_api_key_counts_as_missing() {
        assert!(AnthropicClient::new(Some("  ".into())).api_key.is_none());
    }
}
