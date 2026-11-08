//! Anthropic Messages API adapter: streams a reply over server-sent events
//! and maps it onto [`ModelEvent`]s.

use serde_json::{json, Value};
use tokio::sync::mpsc;

use std::sync::Arc;

use crate::model::{ChatMessage, ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest};
use crate::providers::{
    current_key, fit_models, CustomizableProvider, KeyHandle, ModelInfo, ModelListRequest,
    ModelProvider,
};
use crate::sse::{SseEvent, SseParser};
use api_types::ProviderModel;

pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";
const API_VERSION: &str = "2026-10-21";
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const MAX_TOKENS: u32 = 64_000;

#[derive(Debug, Clone)]
pub struct AnthropicClient {
    http: reqwest::Client,
    base_url: String,
    key: KeyHandle,
    model: String,
    /// The name errors use.
    provider: String,
    /// False for another service speaking this format, which may reject what
    /// only Anthropic's own API accepts.
    first_party: bool,
}

impl AnthropicClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self::with_key_handle(Arc::new(std::sync::RwLock::new(api_key)))
    }

    /// A client that reads its key from `key` for every request, so an open
    /// session follows a key changed or removed in Settings.
    pub fn with_key_handle(key: KeyHandle) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: DEFAULT_BASE_URL.into(),
            key,
            model: DEFAULT_MODEL.into(),
            provider: "Anthropic".into(),
            first_party: true,
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
    id: String,
    name: String,
    first_party: bool,
    base_url: String,
    key: KeyHandle,
    /// The user's model list; the built-in one when `None`.
    models: Option<Vec<ModelInfo>>,
}

impl AnthropicProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            id: "anthropic".into(),
            name: "Anthropic".into(),
            first_party: true,
            base_url: DEFAULT_BASE_URL.into(),
            key: Arc::new(std::sync::RwLock::new(api_key)),
            models: None,
        }
    }

    /// Another service that speaks the Messages API, added by the user. Forge
    /// knows nothing about its models, so they offer no effort setting.
    pub fn custom(id: &str, name: &str, base_url: &str, models: &[ProviderModel]) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            first_party: false,
            base_url: without_version(base_url),
            key: Arc::new(std::sync::RwLock::new(None)),
            models: Some(fit_models(&[], models)),
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    /// The key this provider uses; writing to it changes the key for every
    /// session, including open ones.
    pub fn key_handle(&self) -> KeyHandle {
        self.key.clone()
    }
}

impl ModelProvider for AnthropicProvider {
    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn models(&self) -> Vec<ModelInfo> {
        if let Some(models) = &self.models {
            return models.clone();
        }
        MODELS
            .iter()
            .map(|(id, name)| ModelInfo {
                id: (*id).into(),
                name: (*name).into(),
                // Every Claude model offered takes all five levels.
                efforts: api_types::ReasoningEffort::ALL.to_vec(),
            })
            .collect()
    }

    fn client(&self, model: &str) -> Arc<dyn ModelClient> {
        let mut client = AnthropicClient::with_key_handle(self.key.clone())
            .with_base_url(self.base_url.clone())
            .with_model(model);
        client.provider = self.name.clone();
        client.first_party = self.first_party;
        Arc::new(client)
    }

    fn is_configured(&self) -> bool {
        current_key(&self.key).is_some()
    }
}

/// The base URL without a trailing `/v1`, which this adapter adds itself. People
/// often paste it, because other APIs include it.
fn without_version(base_url: &str) -> String {
    base_url
        .trim_end_matches('/')
        .trim_end_matches("/v1")
        .to_string()
}

impl CustomizableProvider for AnthropicProvider {
    fn default_base_url(&self) -> String {
        self.base_url.clone()
    }

    fn customized(
        &self,
        base_url: Option<&str>,
        models: Option<&[ProviderModel]>,
    ) -> Arc<dyn ModelProvider> {
        let mut provider = self.clone();
        if let Some(base_url) = base_url {
            provider.base_url = without_version(base_url);
        }
        if let Some(picks) = models {
            provider.models = Some(fit_models(&self.models(), picks));
        }
        Arc::new(provider)
    }

    fn models_request(&self, base_url: &str, key: &str) -> ModelListRequest {
        ModelListRequest {
            url: format!("{}/v1/models?limit=1000", without_version(base_url)),
            headers: vec![
                ("x-api-key", key.to_string()),
                ("anthropic-version", API_VERSION.to_string()),
            ],
        }
    }
}

/// `messages` without unsigned thinking, which comes from another provider
/// after a session changes model and which this API would refuse.
fn without_unsigned_thinking(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let mut messages = messages.to_vec();
    for message in &mut messages {
        message.content.retain(|block| {
            !matches!(block, ContentBlock::Thinking { signature, .. } if signature.is_empty())
        });
    }
    messages
}

pub(crate) fn request_body(model: &str, request: &ModelRequest) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": request.max_tokens.unwrap_or(MAX_TOKENS),
        "stream": true,
        "fallbacks": "default",
        "messages": without_unsigned_thinking(&request.messages),
    });
    if !request.tools.is_empty() {
        body["tools"] = json!(request.tools);
    }
    if let Some(system) = &request.system {
        body["system"] = json!(system);
    }
    // Thinking is left out so it stays adaptive; effort sets its depth.
    if let Some(effort) = request.effort {
        body["output_config"] = json!({ "effort": effort.as_str() });
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
    /// Usage as reported so far: `message_start` gives the prompt side,
    /// `message_delta` the running output count.
    usage: Option<api_types::Usage>,
}

/// Reads the counts present in an Anthropic `usage` object into `usage`.
/// `input_tokens` already excludes cached tokens in this API.
fn merge_usage(usage: &mut api_types::Usage, reported: &Value) {
    let count = |key: &str| reported[key].as_u64();
    if let Some(n) = count("input_tokens") {
        usage.input = n;
    }
    if let Some(n) = count("output_tokens") {
        usage.output = n;
    }
    if let Some(n) = count("cache_read_input_tokens") {
        usage.cache_read = n;
    }
    if let Some(n) = count("cache_creation_input_tokens") {
        usage.cache_write = n;
    }
}

impl StreamAssembler {
    pub(crate) fn handle(&mut self, event: &SseEvent) -> Result<Vec<ModelEvent>, ModelError> {
        let data: Value =
            serde_json::from_str(&event.data).map_err(|e| ModelError::Stream(e.to_string()))?;
        let index = data["index"].as_u64().unwrap_or_default() as usize;
        match data["type"].as_str() {
            Some("message_start") => {
                let reported = &data["message"]["usage"];
                if reported.is_object() {
                    merge_usage(self.usage.get_or_insert_with(Default::default), reported);
                }
            }
            Some("content_block_start") => {
                while self.blocks.len() <= index {
                    self.blocks.push(PartialBlock::Unsupported);
                }
                self.blocks[index] = PartialBlock::start(&data["content_block"]);
                if matches!(self.blocks[index], PartialBlock::ToolUse { .. }) {
                    return Ok(vec![ModelEvent::ToolCallDelta]);
                }
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
                        return Ok(vec![ModelEvent::ToolCallDelta]);
                    }
                    (Some("thinking_delta"), Some(PartialBlock::Thinking { thinking, .. })) => {
                        thinking.push_str(piece("thinking"));
                        return Ok(vec![ModelEvent::ReasoningDelta(piece("thinking").into())]);
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
            Some("message_delta") => {
                let reported = &data["usage"];
                if reported.is_object() {
                    merge_usage(self.usage.get_or_insert_with(Default::default), reported);
                }
            }
            Some("message_stop") => {
                let content = std::mem::take(&mut self.blocks)
                    .into_iter()
                    .filter_map(PartialBlock::finish)
                    .collect();
                let mut events: Vec<_> = self
                    .usage
                    .take()
                    .map(ModelEvent::Usage)
                    .into_iter()
                    .collect();
                events.push(ModelEvent::Message(content));
                return Ok(events);
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
        let api_key = current_key(&self.key).ok_or_else(|| ModelError::MissingApiKey {
            provider: self.provider.clone(),
        })?;
        let mut body = request_body(&self.model, &request);
        let mut call = self
            .http
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", API_VERSION);
        if self.first_party {
            call = call.header("anthropic-beta", FALLBACK_BETA);
        } else if let Some(fields) = body.as_object_mut() {
            fields.remove("fallbacks");
        }
        let mut response = call
            .json(&body)
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

    /// The assembled messages, without the deltas that stream before them.
    fn only_messages(events: Vec<ModelEvent>) -> Vec<ModelEvent> {
        events
            .into_iter()
            .filter(|e| matches!(e, ModelEvent::Message(_)))
            .collect()
    }

    #[test]
    fn usage_reasoning_and_tool_starts_are_reported() {
        let events = feed(&[
            sse(
                "message_start",
                json!({"type":"message_start","message":{"usage":{
                    "input_tokens": 12, "output_tokens": 1,
                    "cache_read_input_tokens": 300, "cache_creation_input_tokens": 40
                }}}),
            ),
            block_start(0, json!({"type":"thinking","thinking":"","signature":""})),
            delta(0, json!({"type":"thinking_delta","thinking":"Let me "})),
            delta(0, json!({"type":"thinking_delta","thinking":"look."})),
            block_stop(0),
            block_start(
                1,
                json!({"type":"tool_use","id":"t1","name":"read","input":{}}),
            ),
            delta(1, json!({"type":"input_json_delta","partial_json":"{}"})),
            block_stop(1),
            sse(
                "message_delta",
                json!({"type":"message_delta","delta":{"stop_reason":"tool_use"},
                       "usage":{"output_tokens": 57}}),
            ),
            message_stop(),
        ])
        .unwrap();

        assert_eq!(events[0], ModelEvent::ReasoningDelta("Let me ".into()));
        assert_eq!(events[1], ModelEvent::ReasoningDelta("look.".into()));
        assert_eq!(events[2], ModelEvent::ToolCallDelta);
        assert_eq!(events[3], ModelEvent::ToolCallDelta);
        assert_eq!(
            events[4],
            ModelEvent::Usage(api_types::Usage {
                input: 12,
                output: 57,
                cache_read: 300,
                cache_write: 40,
            })
        );
        assert!(matches!(events[5], ModelEvent::Message(_)));
        assert_eq!(events.len(), 6);
    }

    #[test]
    fn a_stream_without_usage_reports_none() {
        let events = feed(&[
            block_start(0, json!({"type":"text","text":""})),
            delta(0, json!({"type":"text_delta","text":"hi"})),
            message_stop(),
        ])
        .unwrap();
        assert!(!events.iter().any(|e| matches!(e, ModelEvent::Usage(_))));
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
            only_messages(out),
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
            only_messages(out),
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
            only_messages(out),
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
    fn request_body_drops_only_unsigned_thinking() {
        let thinking = |signature: &str| ContentBlock::Thinking {
            thinking: "because".into(),
            signature: signature.into(),
        };
        let req = ModelRequest {
            messages: vec![ChatMessage::assistant(vec![
                thinking(""),
                thinking("signed"),
                ContentBlock::Text {
                    text: "done".into(),
                },
            ])],
            tools: vec![],
            system: None,
            effort: None,
            max_tokens: None,
        };
        let body = request_body("m", &req);
        let content = body["messages"][0]["content"].as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["signature"], "signed");
        assert_eq!(content[1]["text"], "done");
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
            effort: None,
            max_tokens: None,
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
        assert_eq!(
            names,
            ["read", "write", "edit", "glob", "grep", "web_fetch", "bash"]
        );
        assert!(body["tools"][0]["input_schema"].is_object());
    }

    #[test]
    fn request_body_omits_tools_when_there_are_none() {
        let req = ModelRequest {
            messages: vec![ChatMessage::user_text("hi")],
            tools: vec![],
            system: None,
            effort: None,
            max_tokens: None,
        };
        let body = request_body("m", &req);
        assert!(body.get("tools").is_none());
        assert!(body.get("system").is_none());
        assert!(body.get("output_config").is_none());
    }

    #[test]
    fn request_body_sends_the_system_prompt() {
        let req = ModelRequest {
            messages: vec![ChatMessage::user_text("hi")],
            tools: vec![],
            system: Some("Always respond in French.".into()),
            effort: None,
            max_tokens: None,
        };
        assert_eq!(
            request_body("m", &req)["system"],
            "Always respond in French."
        );
    }

    #[test]
    fn request_body_sets_the_reasoning_effort() {
        let req = ModelRequest {
            messages: vec![ChatMessage::user_text("hi")],
            tools: vec![],
            system: None,
            effort: Some(api_types::ReasoningEffort::Xhigh),
            max_tokens: None,
        };
        let body = request_body("m", &req);
        assert_eq!(body["output_config"], json!({"effort": "xhigh"}));
        // Adaptive thinking stays on: the thinking field is left out.
        assert!(body.get("thinking").is_none());
    }

    #[test]
    fn blank_api_key_counts_as_missing() {
        assert!(current_key(&AnthropicClient::new(Some("  ".into())).key).is_none());
        assert!(!AnthropicProvider::new(Some("  ".into())).is_configured());
        assert!(AnthropicProvider::new(Some("k".into())).is_configured());
    }
}
