//! Providers that speak the OpenAI-compatible chat completions API. Each one
//! is a row in [`PROVIDERS`] served by one adapter, so adding a provider that
//! uses this format means adding a row (PRD §6.1 Models and reasoning effort).

use std::sync::{Arc, RwLock};

use api_types::ReasoningEffort::{self, High, Low, Max, Medium, Xhigh};
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::model::{
    ChatMessage, ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest, Role,
};
use crate::providers::{current_key, KeyHandle, ModelInfo, ModelProvider};
use crate::sse::SseParser;

/// A model a provider offers. The list is curated and committed because a
/// provider's own model list does not say which models suit a coding agent.
#[derive(Debug)]
pub struct ModelSpec {
    pub id: &'static str,
    pub name: &'static str,
    /// The efforts the model accepts; empty when it has no effort setting.
    pub efforts: &'static [ReasoningEffort],
    /// The longest reply to ask for, within the model's output limit.
    pub max_tokens: u32,
}

/// One row of the provider table.
#[derive(Debug)]
pub struct ProviderSpec {
    pub id: &'static str,
    pub name: &'static str,
    /// The API's base URL, up to and including its version.
    pub base_url: &'static str,
    /// The environment variable that can hold the API key.
    pub env_var: &'static str,
    /// The models offered, the default first.
    pub models: &'static [ModelSpec],
}

/// The OpenAI-compatible providers Forge ships.
pub const PROVIDERS: &[ProviderSpec] = &[ProviderSpec {
    id: "nvidia",
    name: "NVIDIA",
    base_url: "https://integrate.api.nvidia.com/v1",
    env_var: "NVIDIA_API_KEY",
    models: &[
        ModelSpec {
            id: "minimaxai/minimax-m3.1-flash",
            name: "MiniMax M3.1 Flash",
            efforts: &[Low, Medium, High, Xhigh, Max],
            max_tokens: 64_000,
        },
        ModelSpec {
            id: "z-ai/glm-5.3-flash",
            name: "GLM 5.3 Flash",
            efforts: &[Low, High, Max],
            max_tokens: 64_000,
        },
        ModelSpec {
            id: "nvidia/nemotron-3-ultra-550b-a55b",
            name: "Nemotron 3 Ultra",
            efforts: &[Medium, High],
            max_tokens: 64_000,
        },
        ModelSpec {
            id: "nvidia/nemotron-3.5-lightning-30b-a3b",
            name: "Nemotron 3.5 Lightning",
            efforts: &[],
            max_tokens: 64_000,
        },
    ],
}];

/// A provider adapter built from a row of the table.
#[derive(Debug, Clone)]
pub struct OpenAiCompatProvider {
    spec: &'static ProviderSpec,
    base_url: String,
    key: KeyHandle,
}

impl OpenAiCompatProvider {
    pub fn new(spec: &'static ProviderSpec, api_key: Option<String>) -> Self {
        Self {
            spec,
            base_url: spec.base_url.to_string(),
            key: Arc::new(RwLock::new(api_key)),
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

impl ModelProvider for OpenAiCompatProvider {
    fn id(&self) -> &str {
        self.spec.id
    }

    fn name(&self) -> &str {
        self.spec.name
    }

    fn models(&self) -> Vec<ModelInfo> {
        self.spec
            .models
            .iter()
            .map(|m| ModelInfo {
                id: m.id.into(),
                name: m.name.into(),
                efforts: m.efforts.to_vec(),
            })
            .collect()
    }

    fn client(&self, model: &str) -> Arc<dyn ModelClient> {
        let max_tokens = self
            .spec
            .models
            .iter()
            .find(|m| m.id == model)
            .map(|m| m.max_tokens);
        Arc::new(OpenAiCompatClient {
            http: reqwest::Client::new(),
            provider: self.spec.name,
            base_url: self.base_url.clone(),
            key: self.key.clone(),
            model: model.to_string(),
            max_tokens,
        })
    }

    fn is_configured(&self) -> bool {
        current_key(&self.key).is_some()
    }
}

#[derive(Debug, Clone)]
struct OpenAiCompatClient {
    http: reqwest::Client,
    provider: &'static str,
    base_url: String,
    key: KeyHandle,
    model: String,
    max_tokens: Option<u32>,
}

/// One of our messages as chat messages. A tool result is a message of its
/// own, and must directly follow the assistant message that called the tool,
/// so results come before any text in the same message. Thinking blocks are
/// another provider's format and are left out.
fn to_chat_messages(message: &ChatMessage) -> Vec<Value> {
    let mut text = String::new();
    let mut calls = Vec::new();
    let mut out = Vec::new();
    for block in &message.content {
        match block {
            ContentBlock::Text { text: piece } => text.push_str(piece),
            ContentBlock::ToolUse { id, name, input } => calls.push(json!({
                "id": id,
                "type": "function",
                "function": { "name": name, "arguments": input.to_string() },
            })),
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                // The format has no error flag, so the text has to say it.
                let content = if *is_error {
                    format!("Error: {content}")
                } else {
                    content.clone()
                };
                out.push(json!({
                    "role": "tool",
                    "tool_call_id": tool_use_id,
                    "content": content,
                }));
            }
            ContentBlock::Thinking { .. } | ContentBlock::RedactedThinking { .. } => {}
        }
    }
    let role = match message.role {
        Role::User => "user",
        Role::Assistant => "assistant",
    };
    if !calls.is_empty() {
        out.push(json!({ "role": role, "content": text, "tool_calls": calls }));
    } else if !text.is_empty() {
        out.push(json!({ "role": role, "content": text }));
    }
    out
}

/// The system prompt, then the conversation.
fn chat_messages(request: &ModelRequest) -> Vec<Value> {
    let system = request
        .system
        .iter()
        .map(|text| json!({ "role": "system", "content": text }));
    system
        .chain(request.messages.iter().flat_map(to_chat_messages))
        .collect()
}

fn request_body(model: &str, max_tokens: Option<u32>, request: &ModelRequest) -> Value {
    let mut body = json!({
        "model": model,
        "stream": true,
        "messages": chat_messages(request),
    });
    if !request.tools.is_empty() {
        let tools: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    },
                })
            })
            .collect();
        body["tools"] = json!(tools);
    }
    if let Some(max_tokens) = request.max_tokens.or(max_tokens) {
        body["max_tokens"] = json!(max_tokens);
    }
    if let Some(effort) = request.effort {
        body["reasoning_effort"] = json!(effort.as_str());
    }
    body
}

/// A tool call while its fragments are still arriving.
#[derive(Default)]
struct PartialCall {
    id: String,
    name: String,
    arguments: String,
}

/// Turns the chat completions event stream into model events: text deltas as
/// they arrive, then the whole message once the stream ends.
#[derive(Default)]
struct StreamAssembler {
    text: String,
    calls: Vec<PartialCall>,
}

impl StreamAssembler {
    fn handle(&mut self, data: &str) -> Result<Vec<ModelEvent>, ModelError> {
        if data.trim() == "[DONE]" {
            return Ok(Vec::new());
        }
        let chunk: Value =
            serde_json::from_str(data).map_err(|e| ModelError::Stream(e.to_string()))?;
        if chunk.get("error").is_some() {
            return Err(ModelError::Stream(
                error_message(&chunk)
                    .unwrap_or_else(|| "the provider reported an error".to_string()),
            ));
        }
        let choice = &chunk["choices"][0];
        if choice["finish_reason"] == "content_filter" {
            return Err(ModelError::Refusal);
        }
        let delta = &choice["delta"];
        for fragment in delta["tool_calls"].as_array().into_iter().flatten() {
            self.add_call_fragment(fragment);
        }
        match delta["content"].as_str() {
            Some(piece) if !piece.is_empty() => {
                self.text.push_str(piece);
                Ok(vec![ModelEvent::TextDelta(piece.to_string())])
            }
            _ => Ok(Vec::new()),
        }
    }

    /// Fragments name their call by `index`. Where a provider leaves it out, a
    /// fragment with an id starts a new call and any other continues the last.
    fn add_call_fragment(&mut self, fragment: &Value) {
        let starts_call = fragment["id"].as_str().is_some_and(|id| !id.is_empty());
        let index = match fragment["index"].as_u64() {
            Some(index) => index as usize,
            None if starts_call => self.calls.len(),
            None => self.calls.len().saturating_sub(1),
        };
        while self.calls.len() <= index {
            self.calls.push(PartialCall::default());
        }
        let call = &mut self.calls[index];
        if let Some(id) = fragment["id"].as_str() {
            call.id = id.to_string();
        }
        let function = &fragment["function"];
        if let Some(name) = function["name"].as_str() {
            call.name.push_str(name);
        }
        if let Some(arguments) = function["arguments"].as_str() {
            call.arguments.push_str(arguments);
        }
    }

    fn finish(self) -> ModelEvent {
        let mut content = Vec::new();
        if !self.text.is_empty() {
            content.push(ContentBlock::Text { text: self.text });
        }
        for (i, call) in self.calls.into_iter().enumerate() {
            content.push(ContentBlock::ToolUse {
                // The result has to name the call, so each needs some id.
                id: if call.id.is_empty() {
                    format!("call_{i}")
                } else {
                    call.id
                },
                name: call.name,
                // An unparsable input leaves the tool without arguments; the
                // tool then reports what is missing to the model.
                input: serde_json::from_str(&call.arguments).unwrap_or_else(|_| json!({})),
            });
        }
        ModelEvent::Message(content)
    }
}

/// The reason in an error body; these APIs do not agree on where it goes.
fn error_message(body: &Value) -> Option<String> {
    [
        &body["error"]["message"],
        &body["error"],
        &body["detail"],
        &body["message"],
    ]
    .into_iter()
    .find_map(|v| v.as_str().map(String::from))
}

impl OpenAiCompatClient {
    async fn run(
        &self,
        request: ModelRequest,
        tx: &mpsc::Sender<Result<ModelEvent, ModelError>>,
    ) -> Result<(), ModelError> {
        let key = current_key(&self.key).ok_or_else(|| ModelError::MissingApiKey {
            provider: self.provider.to_string(),
        })?;
        let mut response = self
            .http
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(key)
            .header("accept", "text/event-stream")
            .json(&request_body(&self.model, self.max_tokens, &request))
            .send()
            .await
            .map_err(|e| ModelError::Request(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let message = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| error_message(&v))
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
                for model_event in assembler.handle(&event.data)? {
                    if tx.send(Ok(model_event)).await.is_err() {
                        // The turn was dropped; stop reading the stream.
                        return Ok(());
                    }
                }
            }
        }
        let _ = tx.send(Ok(assembler.finish())).await;
        Ok(())
    }
}

impl ModelClient for OpenAiCompatClient {
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
    use crate::tools::ToolSpec;

    fn request(effort: Option<ReasoningEffort>) -> ModelRequest {
        ModelRequest {
            messages: vec![
                ChatMessage::user_text("Hi"),
                ChatMessage::assistant(vec![
                    ContentBlock::Thinking {
                        thinking: "hmm".into(),
                        signature: "sig".into(),
                    },
                    ContentBlock::Text {
                        text: "Hello".into(),
                    },
                ]),
            ],
            tools: vec![],
            system: Some("Be brief.".into()),
            effort,
            max_tokens: None,
        }
    }

    #[test]
    fn the_request_carries_the_conversation_without_thinking() {
        let body = request_body("m1", Some(64_000), &request(Some(High)));
        assert_eq!(body["model"], "m1");
        assert_eq!(body["stream"], true);
        assert_eq!(body["max_tokens"], 64_000);
        assert_eq!(body["reasoning_effort"], "high");
        assert_eq!(
            body["messages"],
            json!([
                { "role": "system", "content": "Be brief." },
                { "role": "user", "content": "Hi" },
                { "role": "assistant", "content": "Hello" },
            ])
        );
    }

    #[test]
    fn a_model_without_an_effort_setting_sends_none() {
        let body = request_body("m1", None, &request(None));
        assert!(body.get("reasoning_effort").is_none());
        assert!(body.get("max_tokens").is_none());
    }

    #[test]
    fn a_request_cap_wins_over_the_models_limit() {
        let mut capped = request(None);
        capped.max_tokens = Some(1);
        assert_eq!(request_body("m1", Some(64_000), &capped)["max_tokens"], 1);
    }

    #[test]
    fn text_streams_as_deltas_then_the_whole_message() {
        let mut assembler = StreamAssembler::default();
        let chunk = |text: &str| json!({ "choices": [{ "delta": { "content": text } }] });
        assert_eq!(
            assembler.handle(&chunk("Hel").to_string()).unwrap(),
            [ModelEvent::TextDelta("Hel".into())]
        );
        assert_eq!(
            assembler.handle(&chunk("lo").to_string()).unwrap(),
            [ModelEvent::TextDelta("lo".into())]
        );
        // Role-only and usage-only chunks and the end marker add nothing.
        assert!(assembler
            .handle(r#"{"choices":[{"delta":{"role":"assistant"}}]}"#)
            .unwrap()
            .is_empty());
        assert!(assembler.handle(r#"{"choices":[]}"#).unwrap().is_empty());
        assert!(assembler.handle("[DONE]").unwrap().is_empty());
        assert_eq!(
            assembler.finish(),
            ModelEvent::Message(vec![ContentBlock::Text {
                text: "Hello".into()
            }])
        );
    }

    #[test]
    fn tool_call_fragments_are_assembled_by_index() {
        let mut assembler = StreamAssembler::default();
        for chunk in [
            json!({ "choices": [{ "delta": { "content": "Reading." } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [
                { "index": 0, "id": "a", "function": { "name": "read_file", "arguments": "" } }
            ] } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [
                { "index": 1, "id": "b", "function": { "name": "list_dir", "arguments": "{}" } }
            ] } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [
                { "index": 0, "function": { "arguments": "{\"path\":" } }
            ] } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [
                { "index": 0, "function": { "arguments": "\"a.rs\"}" } }
            ] } }] }),
        ] {
            assembler.handle(&chunk.to_string()).unwrap();
        }
        assert_eq!(
            assembler.finish(),
            ModelEvent::Message(vec![
                ContentBlock::Text {
                    text: "Reading.".into()
                },
                ContentBlock::ToolUse {
                    id: "a".into(),
                    name: "read_file".into(),
                    input: json!({ "path": "a.rs" }),
                },
                ContentBlock::ToolUse {
                    id: "b".into(),
                    name: "list_dir".into(),
                    input: json!({}),
                },
            ])
        );
    }

    #[test]
    fn fragments_without_an_index_follow_the_id() {
        let mut assembler = StreamAssembler::default();
        for fragment in [
            json!({ "id": "a", "function": { "name": "one", "arguments": "{\"x\":" } }),
            json!({ "function": { "arguments": "1}" } }),
            json!({ "id": "b", "function": { "name": "two", "arguments": "{}" } }),
        ] {
            assembler.add_call_fragment(&fragment);
        }
        let ModelEvent::Message(content) = assembler.finish() else {
            panic!("expected a message");
        };
        assert_eq!(content.len(), 2);
        assert_eq!(
            content[0],
            ContentBlock::ToolUse {
                id: "a".into(),
                name: "one".into(),
                input: json!({ "x": 1 }),
            }
        );
    }

    #[test]
    fn a_broken_call_still_gets_an_id_and_empty_arguments() {
        let mut assembler = StreamAssembler::default();
        assembler.add_call_fragment(
            &json!({ "index": 0, "function": { "name": "one", "arguments": "{\"x\"" } }),
        );
        assert_eq!(
            assembler.finish(),
            ModelEvent::Message(vec![ContentBlock::ToolUse {
                id: "call_0".into(),
                name: "one".into(),
                input: json!({}),
            }])
        );
    }

    #[test]
    fn tools_and_a_tool_round_trip_use_the_chat_format() {
        let req = ModelRequest {
            messages: vec![
                ChatMessage::assistant(vec![
                    ContentBlock::Text {
                        text: "Reading.".into(),
                    },
                    ContentBlock::ToolUse {
                        id: "a".into(),
                        name: "read_file".into(),
                        input: json!({ "path": "a.rs" }),
                    },
                ]),
                ChatMessage::user(vec![
                    ContentBlock::ToolResult {
                        tool_use_id: "a".into(),
                        content: "no such file".into(),
                        is_error: true,
                    },
                    ContentBlock::Text {
                        text: "Try again".into(),
                    },
                ]),
            ],
            tools: vec![ToolSpec {
                name: "read_file",
                description: "Reads a file",
                input_schema: json!({ "type": "object" }),
            }],
            system: None,
            effort: None,
            max_tokens: None,
        };
        let body = request_body("m1", None, &req);
        assert_eq!(
            body["tools"],
            json!([{ "type": "function", "function": {
                "name": "read_file",
                "description": "Reads a file",
                "parameters": { "type": "object" },
            } }])
        );
        assert_eq!(
            body["messages"],
            json!([
                { "role": "assistant", "content": "Reading.", "tool_calls": [{
                    "id": "a",
                    "type": "function",
                    "function": { "name": "read_file", "arguments": "{\"path\":\"a.rs\"}" },
                }] },
                { "role": "tool", "tool_call_id": "a", "content": "Error: no such file" },
                { "role": "user", "content": "Try again" },
            ])
        );
    }

    #[test]
    fn errors_in_the_stream_are_reported() {
        let mut assembler = StreamAssembler::default();
        assert_eq!(
            assembler.handle(r#"{"error":{"message":"overloaded"}}"#),
            Err(ModelError::Stream("overloaded".into()))
        );
        assert!(matches!(
            assembler.handle("not json"),
            Err(ModelError::Stream(_))
        ));
        assert_eq!(
            assembler.handle(r#"{"choices":[{"delta":{},"finish_reason":"content_filter"}]}"#),
            Err(ModelError::Refusal)
        );
    }

    #[test]
    fn error_bodies_are_read_wherever_the_provider_puts_the_reason() {
        for body in [
            json!({ "error": { "message": "no" } }),
            json!({ "error": "no" }),
            json!({ "detail": "no" }),
            json!({ "message": "no" }),
        ] {
            assert_eq!(error_message(&body).as_deref(), Some("no"), "{body}");
        }
        assert_eq!(error_message(&json!({})), None);
    }

    #[test]
    fn every_curated_model_has_a_reply_limit_and_efforts_the_api_knows() {
        for spec in PROVIDERS {
            assert!(!spec.models.is_empty(), "{}", spec.id);
            assert!(spec.base_url.starts_with("https://"), "{}", spec.id);
            for model in spec.models {
                assert!(model.max_tokens > 0, "{}", model.id);
                for effort in model.efforts {
                    assert!(ReasoningEffort::ALL.contains(effort), "{}", model.id);
                }
            }
        }
    }
}
