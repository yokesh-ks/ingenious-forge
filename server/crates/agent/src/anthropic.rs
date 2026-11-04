//! Anthropic Messages API adapter: streams a reply over server-sent events
//! and maps it onto [`ModelEvent`]s.

use serde_json::{json, Value};
use tokio::sync::mpsc;

use std::sync::Arc;

use crate::model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest};
use crate::providers::{ModelInfo, ModelProvider};
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

/// The Claude models offered, the default first.
const MODELS: &[(&str, &str)] = &[
    (DEFAULT_MODEL, "Claude Opus 5.5"),
    ("claude-fable-5-1", "Claude Fable 5.1"),
    ("claude-sonnet-5-5", "Claude Sonnet 5.5"),
    ("claude-haiku-5-5", "Claude Haiku 5.5"),
];

/// The Anthropic provider adapter: builds an [`AnthropicClient`] per model.
#[derive(Debug, Clone)]
pub struct AnthropicProvider {
    client: AnthropicClient,
}

impl AnthropicProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: AnthropicClient::new(api_key),
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.client = self.client.with_base_url(base_url);
        self
    }
}

impl ModelProvider for AnthropicProvider {
    fn id(&self) -> &str {
        "anthropic"
    }

    fn name(&self) -> &str {
        "Anthropic"
    }

    fn models(&self) -> Vec<ModelInfo> {
        MODELS
            .iter()
            .map(|(id, name)| ModelInfo {
                id: (*id).into(),
                name: (*name).into(),
            })
            .collect()
    }

    fn client(&self, model: &str) -> Arc<dyn ModelClient> {
        Arc::new(self.client.clone().with_model(model))
    }
}

pub(crate) fn request_body(model: &str, request: &ModelRequest) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "stream": true,
        "fallbacks": "default",
        "messages": request.messages,
    });
    if !request.tools.is_empty() {
        body["tools"] = json!(request.tools);
    }
    if let Some(system) = &request.system {
        body["system"] = json!(system);
    }
    body
}

/// A content block while its deltas are still arriving.
enum PartialBlock {
    Text(String),
    Thinking {
        thinking: String,
        signature: String,
    },
    Redacted(String),
    ToolUse {
        id: String,
        name: String,
        json: String,
    },
    Unsupported,
}

impl PartialBlock {
    fn start(block: &Value) -> Self {
        let text = |key: &str| block[key].as_str().unwrap_or_default().to_string();
        match block["type"].as_str() {
            Some("text") => Self::Text(text("text")),
            Some("thinking") => Self::Thinking {
                thinking: text("thinking"),
                signature: text("signature"),
            },
            Some("redacted_thinking") => Self::Redacted(text("data")),
            Some("tool_use") => Self::ToolUse {
                id: text("id"),
                name: text("name"),
                json: String::new(),
            },
            _ => Self::Unsupported,
        }
    }

    fn finish(self) -> Option<ContentBlock> {
        Some(match self {
            Self::Text(text) => ContentBlock::Text { text },
            Self::Thinking {
                thinking,
                signature,
            } => ContentBlock::Thinking {
                thinking,
                signature,
            },
            Self::Redacted(data) => ContentBlock::RedactedThinking { data },
            Self::ToolUse { id, name, json } => {
                // An unparsable input leaves the tool without arguments; the
                // tool then reports what is missing to the model.
                let input = serde_json::from_str(&json).unwrap_or_else(|_| json!({}));
                ContentBlock::ToolUse { id, name, input }
            }
            Self::Unsupported => return None,
        })
    }
}

/// Turns the Messages API event stream into model events: text deltas as
/// they arrive, then the whole assistant message at `message_stop`.
#[derive(Default)]
pub(crate) struct StreamAssembler {
    blocks: Vec<PartialBlock>,
}

impl StreamAssembler {
    pub(crate) fn handle(&mut self, event: &SseEvent) -> Result<Vec<ModelEvent>, ModelError> {
        let data: Value =
            serde_json::from_str(&event.data).map_err(|e| ModelError::Stream(e.to_string()))?;
        let index = data["index"].as_u64().unwrap_or_default() as usize;
        match data["type"].as_str() {
            Some("content_block_start") => {
                while self.blocks.len() <= index {
                    self.blocks.push(PartialBlock::Unsupported);
                }
                self.blocks[index] = PartialBlock::start(&data["content_block"]);
            }
            Some("content_block_delta") => {
                let delta = &data["delta"];
                let piece = |key: &str| delta[key].as_str().unwrap_or_default();
                let block = self.blocks.get_mut(index);
                match (delta["type"].as_str(), block) {
                    (Some("text_delta"), block) => {
                        if let Some(PartialBlock::Text(text)) = block {
                            text.push_str(piece("text"));
                        }
                        return Ok(vec![ModelEvent::TextDelta(piece("text").into())]);
                    }
                    (Some("input_json_delta"), Some(PartialBlock::ToolUse { json, .. })) => {
                        json.push_str(piece("partial_json"));
                    }
                    (Some("thinking_delta"), Some(PartialBlock::Thinking { thinking, .. })) => {
                        thinking.push_str(piece("thinking"));
                    }
                    (Some("signature_delta"), Some(PartialBlock::Thinking { signature, .. })) => {
                        signature.push_str(piece("signature"));
                    }
                    _ => {}
                }
            }
            Some("message_delta") if data["delta"]["stop_reason"] == "refusal" => {
                return Err(ModelError::Refusal);
            }
            Some("message_stop") => {
                let content = std::mem::take(&mut self.blocks)
                    .into_iter()
                    .filter_map(PartialBlock::finish)
                    .collect();
                return Ok(vec![ModelEvent::Message(content)]);
            }
            Some("error") => return Err(ModelError::Stream(error_message(&data))),
            _ => {}
        }
        Ok(Vec::new())
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
        let mut assembler = StreamAssembler::default();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| ModelError::Stream(e.to_string()))?
        {
            for event in parser.push(&chunk) {
                for model_event in assembler.handle(&event)? {
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
    use crate::model::{ChatMessage, ContentBlock};
    use crate::tools::ToolBox;

    fn sse(event: &str, data: Value) -> SseEvent {
        SseEvent {
            event: event.into(),
            data: data.to_string(),
        }
    }

    fn feed(events: &[SseEvent]) -> Result<Vec<ModelEvent>, ModelError> {
        let mut assembler = StreamAssembler::default();
        let mut out = Vec::new();
        for e in events {
            out.extend(assembler.handle(e)?);
        }
        Ok(out)
    }

    fn block_start(index: usize, block: Value) -> SseEvent {
        sse(
            "content_block_start",
            json!({"type":"content_block_start","index":index,"content_block":block}),
        )
    }

    fn delta(index: usize, delta: Value) -> SseEvent {
        sse(
            "content_block_delta",
            json!({"type":"content_block_delta","index":index,"delta":delta}),
        )
    }

    fn block_stop(index: usize) -> SseEvent {
        sse(
            "content_block_stop",
            json!({"type":"content_block_stop","index":index}),
        )
    }

    fn message_stop() -> SseEvent {
        sse("message_stop", json!({"type":"message_stop"}))
    }

    #[test]
    fn text_streams_as_deltas_then_the_whole_message() {
        let out = feed(&[
            sse(
                "message_start",
                json!({"type":"message_start","message":{}}),
            ),
            block_start(0, json!({"type":"text","text":""})),
            delta(0, json!({"type":"text_delta","text":"Hel"})),
            sse("ping", json!({"type":"ping"})),
            delta(0, json!({"type":"text_delta","text":"lo"})),
            block_stop(0),
            sse(
                "message_delta",
                json!({"type":"message_delta","delta":{"stop_reason":"end_turn"}}),
            ),
            message_stop(),
        ])
        .unwrap();
        assert_eq!(
            out,
            vec![
                ModelEvent::TextDelta("Hel".into()),
                ModelEvent::TextDelta("lo".into()),
                ModelEvent::Message(vec![ContentBlock::Text {
                    text: "Hello".into()
                }]),
            ]
        );
    }

    #[test]
    fn tool_use_input_is_assembled_from_partial_json() {
        let out = feed(&[
            block_start(
                0,
                json!({"type":"tool_use","id":"toolu_1","name":"read_file","input":{}}),
            ),
            delta(0, json!({"type":"input_json_delta","partial_json":"{\"pa"})),
            delta(
                0,
                json!({"type":"input_json_delta","partial_json":"th\": \"a.txt\"}"}),
            ),
            block_stop(0),
            message_stop(),
        ])
        .unwrap();
        assert_eq!(
            out,
            vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                id: "toolu_1".into(),
                name: "read_file".into(),
                input: json!({"path":"a.txt"}),
            }])]
        );
    }

    #[test]
    fn tool_use_without_input_deltas_has_an_empty_object() {
        let out = feed(&[
            block_start(
                0,
                json!({"type":"tool_use","id":"t","name":"list_directory","input":{}}),
            ),
            block_stop(0),
            message_stop(),
        ])
        .unwrap();
        assert_eq!(
            out,
            vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                id: "t".into(),
                name: "list_directory".into(),
                input: json!({}),
            }])]
        );
    }

    #[test]
    fn thinking_blocks_are_kept_with_their_signature() {
        let out = feed(&[
            block_start(0, json!({"type":"thinking","thinking":""})),
            delta(0, json!({"type":"thinking_delta","thinking":"hmm"})),
            delta(0, json!({"type":"signature_delta","signature":"sig"})),
            block_stop(0),
            block_start(1, json!({"type":"redacted_thinking","data":"opaque"})),
            block_stop(1),
            message_stop(),
        ])
        .unwrap();
        assert_eq!(
            out,
            vec![ModelEvent::Message(vec![
                ContentBlock::Thinking {
                    thinking: "hmm".into(),
                    signature: "sig".into()
                },
                ContentBlock::RedactedThinking {
                    data: "opaque".into()
                },
            ])]
        );
    }

    #[test]
    fn unknown_block_types_are_dropped() {
        let out = feed(&[
            block_start(0, json!({"type":"server_tool_use","id":"x"})),
            block_stop(0),
            message_stop(),
        ])
        .unwrap();
        assert_eq!(out, vec![ModelEvent::Message(vec![])]);
    }

    #[test]
    fn error_event_is_a_stream_error() {
        let e = sse(
            "error",
            json!({"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}),
        );
        assert_eq!(feed(&[e]), Err(ModelError::Stream("Overloaded".into())));
    }

    #[test]
    fn refusal_stop_reason_is_reported() {
        let e = sse(
            "message_delta",
            json!({"type":"message_delta","delta":{"stop_reason":"refusal"}}),
        );
        assert_eq!(feed(&[e]), Err(ModelError::Refusal));
    }

    #[test]
    fn malformed_json_is_a_stream_error() {
        let e = SseEvent {
            event: "content_block_delta".into(),
            data: "{not json".into(),
        };
        assert!(matches!(feed(&[e]), Err(ModelError::Stream(_))));
    }

    #[test]
    fn request_body_streams_the_conversation_and_tools() {
        let req = ModelRequest {
            messages: vec![
                ChatMessage::user_text("hi"),
                ChatMessage::assistant(vec![ContentBlock::ToolUse {
                    id: "t1".into(),
                    name: "read_file".into(),
                    input: json!({"path":"a"}),
                }]),
                ChatMessage::user(vec![ContentBlock::ToolResult {
                    tool_use_id: "t1".into(),
                    content: "body".into(),
                    is_error: false,
                }]),
            ],
            tools: ToolBox::new(".").specs(),
            system: None,
        };
        let body = request_body("claude-opus-5-5", &req);
        assert_eq!(body["model"], "claude-opus-5-5");
        assert_eq!(body["stream"], true);
        assert_eq!(body["max_tokens"], MAX_TOKENS);
        assert_eq!(body["fallbacks"], "default");
        assert_eq!(
            body["messages"],
            json!([
                {"role":"user","content":[{"type":"text","text":"hi"}]},
                {"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"read_file","input":{"path":"a"}}]},
                {"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"body","is_error":false}]}
            ])
        );
        let names: Vec<_> = body["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, ["read_file", "edit_file", "list_directory"]);
        assert!(body["tools"][0]["input_schema"].is_object());
    }

    #[test]
    fn request_body_omits_tools_when_there_are_none() {
        let req = ModelRequest {
            messages: vec![ChatMessage::user_text("hi")],
            tools: vec![],
            system: None,
        };
        let body = request_body("m", &req);
        assert!(body.get("tools").is_none());
        assert!(body.get("system").is_none());
    }

    #[test]
    fn request_body_sends_the_system_prompt() {
        let req = ModelRequest {
            messages: vec![ChatMessage::user_text("hi")],
            tools: vec![],
            system: Some("Always respond in French.".into()),
        };
        assert_eq!(
            request_body("m", &req)["system"],
            "Always respond in French."
        );
    }

    #[test]
    fn blank_api_key_counts_as_missing() {
        assert!(AnthropicClient::new(Some("  ".into())).api_key.is_none());
    }
}
