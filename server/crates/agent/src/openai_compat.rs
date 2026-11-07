//! Providers that speak the OpenAI-compatible chat completions API. Each one
//! is a row in [`PROVIDERS`] served by one adapter, so adding a provider that
//! uses this format means adding a row (PRD §6.1 Models and reasoning effort).

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, RwLock},
};

use api_types::ReasoningEffort::{self, High, Low, Max, Medium, Xhigh};
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::model::{
    ChatMessage, ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest, Role,
};
use crate::openai_responses as responses;
use crate::providers::{
    current_key, fit_models, CustomizableProvider, KeyHandle, ModelInfo, ModelListRequest,
    ModelProvider,
};
use crate::sse::SseParser;
use api_types::ProviderModel;

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
    /// One line on what the provider offers, shown in Settings.
    pub description: &'static str,
    /// The API's base URL, up to and including its version.
    pub base_url: &'static str,
    /// The environment variable that can hold the API key.
    pub env_var: &'static str,
    /// The request field that caps the reply; these APIs do not all agree.
    pub max_tokens_field: &'static str,
    /// The models offered, the default first.
    pub models: &'static [ModelSpec],
}

const fn model(
    id: &'static str,
    name: &'static str,
    efforts: &'static [ReasoningEffort],
) -> ModelSpec {
    ModelSpec {
        id,
        name,
        efforts,
        max_tokens: 64_000,
    }
}

const ALL_EFFORTS: &[ReasoningEffort] = &[Low, Medium, High, Xhigh, Max];

/// The OpenAI-compatible providers Forge ships. Each model is listed with tool
/// calls in the public `models.dev` catalog.
pub const PROVIDERS: &[ProviderSpec] = &[
    ProviderSpec {
        id: "deepseek",
        name: "DeepSeek",
        description: "DeepSeek models for reasoning and coding tasks",
        base_url: "https://api.deepseek.com",
        env_var: "DEEPSEEK_API_KEY",
        max_tokens_field: "max_tokens",
        models: &[
            model("deepseek-flash", "DeepSeek V4.1 Flash", &[Low, High, Max]),
            model("deepseek-v4-pro", "DeepSeek V4 Pro", &[Low, High, Max]),
        ],
    },
    ProviderSpec {
        id: "google",
        name: "Google",
        description: "Gemini models with an API key",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        env_var: "GEMINI_API_KEY",
        max_tokens_field: "max_tokens",
        models: &[
            ModelSpec {
                id: "gemini-4-argon",
                name: "Gemini 4 Argon",
                efforts: &[Low, Medium, High],
                max_tokens: 32_768,
            },
            model("gemini-3.8-flash", "Gemini 3.8 Flash", &[Low, Medium, High]),
        ],
    },
    ProviderSpec {
        id: "nvidia",
        name: "NVIDIA",
        description: "Models hosted by NVIDIA",
        base_url: "https://integrate.api.nvidia.com/v1",
        env_var: "NVIDIA_API_KEY",
        max_tokens_field: "max_tokens",
        models: &[
            model(
                "minimaxai/minimax-m3.1-flash",
                "MiniMax M3.1 Flash",
                ALL_EFFORTS,
            ),
            model("z-ai/glm-5.3-flash", "GLM 5.3 Flash", &[Low, High, Max]),
            model(
                "nvidia/nemotron-3-ultra-550b-a55b",
                "Nemotron 3 Ultra",
                &[Medium, High],
            ),
            model(
                "nvidia/nemotron-3.5-lightning-30b-a3b",
                "Nemotron 3.5 Lightning",
                &[],
            ),
        ],
    },
    ProviderSpec {
        id: "openai",
        name: "OpenAI",
        description: "GPT models with an API key",
        base_url: "https://api.openai.com/v1",
        env_var: "OPENAI_API_KEY",
        max_tokens_field: "max_completion_tokens",
        models: &[
            model("gpt-6.1-terra", "GPT-6.1 Terra", ALL_EFFORTS),
            model("gpt-6.1-sol", "GPT-6.1 Sol", ALL_EFFORTS),
            model("gpt-6-luna", "GPT-6 Luna", ALL_EFFORTS),
        ],
    },
    ProviderSpec {
        id: "openrouter",
        name: "OpenRouter",
        description: "Access many models from one provider",
        base_url: "https://openrouter.ai/api/v1",
        env_var: "OPENROUTER_API_KEY",
        max_tokens_field: "max_tokens",
        models: &[
            model(
                "anthropic/claude-sonnet-5.5",
                "Claude Sonnet 5.5",
                ALL_EFFORTS,
            ),
            model("openai/gpt-6.1-terra", "GPT-6.1 Terra", ALL_EFFORTS),
            model(
                "google/gemini-3.8-flash",
                "Gemini 3.8 Flash",
                &[Low, Medium, High],
            ),
            model("z-ai/glm-5.3-flash", "GLM 5.3 Flash", &[Low, High, Max]),
        ],
    },
    ProviderSpec {
        id: "vercel",
        name: "Vercel AI Gateway",
        description: "Unified access to AI models with smart routing",
        base_url: "https://ai-gateway.vercel.sh/v1",
        env_var: "AI_GATEWAY_API_KEY",
        max_tokens_field: "max_tokens",
        models: &[
            model(
                "anthropic/claude-sonnet-5.5",
                "Claude Sonnet 5.5",
                ALL_EFFORTS,
            ),
            model("openai/gpt-6.1-terra", "GPT-6.1 Terra", ALL_EFFORTS),
            model("google/gemini-3.8-flash", "Gemini 3.8 Flash", &[Low, High]),
            model("zai/glm-5.3-flash", "GLM 5.3 Flash", &[Low, High, Max]),
        ],
    },
];

/// The base URL a custom provider may use, without a trailing slash. An API
/// key must not cross the network in the clear, so plain HTTP is only for this
/// machine.
pub fn check_base_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(trimmed).map_err(|_| format!("not a valid URL: {trimmed}"))?;
    let local = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    match parsed.scheme() {
        "https" => Ok(trimmed.to_string()),
        "http" if local => Ok(trimmed.to_string()),
        "http" => Err("use https:// so the API key is not sent in the clear".to_string()),
        _ => Err(format!("not an http or https URL: {trimmed}")),
    }
}

/// A provider adapter, built from a row of the table or from a custom provider
/// the user added.
#[derive(Debug, Clone)]
pub struct OpenAiCompatProvider {
    id: String,
    name: String,
    base_url: String,
    max_tokens_field: &'static str,
    /// True to use the Responses API rather than chat completions.
    responses: bool,
    /// Each model with the longest reply to ask for, if known.
    models: Vec<(ModelInfo, Option<u32>)>,
    key: KeyHandle,
}

impl OpenAiCompatProvider {
    pub fn new(spec: &'static ProviderSpec, api_key: Option<String>) -> Self {
        Self {
            id: spec.id.to_string(),
            name: spec.name.to_string(),
            base_url: spec.base_url.to_string(),
            max_tokens_field: spec.max_tokens_field,
            responses: false,
            models: spec
                .models
                .iter()
                .map(|m| {
                    let info = ModelInfo {
                        id: m.id.into(),
                        name: m.name.into(),
                        efforts: m.efforts.to_vec(),
                    };
                    (info, Some(m.max_tokens))
                })
                .collect(),
            key: Arc::new(RwLock::new(api_key)),
        }
    }

    /// A provider the user added. Forge knows nothing about its models, so
    /// they offer no effort setting and their replies are not capped.
    pub fn custom(
        id: &str,
        name: &str,
        base_url: &str,
        responses: bool,
        models: &[ProviderModel],
    ) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            base_url: base_url.to_string(),
            max_tokens_field: "max_tokens",
            responses,
            models: models
                .iter()
                .map(|m| {
                    let info = ModelInfo {
                        id: m.id.clone(),
                        name: m.name.clone(),
                        efforts: Vec::new(),
                    };
                    (info, None)
                })
                .collect(),
            key: Arc::new(RwLock::new(None)),
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
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn models(&self) -> Vec<ModelInfo> {
        self.models.iter().map(|(info, _)| info.clone()).collect()
    }

    fn client(&self, model: &str) -> Arc<dyn ModelClient> {
        let max_tokens = self
            .models
            .iter()
            .find(|(info, _)| info.id == model)
            .and_then(|(_, max_tokens)| *max_tokens);
        Arc::new(OpenAiCompatClient {
            http: reqwest::Client::new(),
            provider: self.name.clone(),
            base_url: self.base_url.clone(),
            max_tokens_field: self.max_tokens_field,
            responses: self.responses,
            key: self.key.clone(),
            model: model.to_string(),
            max_tokens,
            call_extras: Arc::default(),
        })
    }

    fn is_configured(&self) -> bool {
        current_key(&self.key).is_some()
    }
}

impl CustomizableProvider for OpenAiCompatProvider {
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
            provider.base_url = base_url.to_string();
        }
        if let Some(picks) = models {
            provider.models = fit_models(&self.models(), picks)
                .into_iter()
                .map(|info| {
                    let cap = self
                        .models
                        .iter()
                        .find(|(known, _)| known.id == info.id)
                        .and_then(|(_, cap)| *cap);
                    (info, cap)
                })
                .collect();
        }
        Arc::new(provider)
    }

    fn models_request(&self, base_url: &str, key: &str) -> ModelListRequest {
        ModelListRequest {
            url: format!("{base_url}/models"),
            headers: vec![("authorization", format!("Bearer {key}"))],
        }
    }
}

#[derive(Debug, Clone)]
struct OpenAiCompatClient {
    http: reqwest::Client,
    provider: String,
    base_url: String,
    max_tokens_field: &'static str,
    responses: bool,
    key: KeyHandle,
    model: String,
    max_tokens: Option<u32>,
    /// Provider-specific data sent with a tool call, by call id. Some providers
    /// reject the next request unless it comes back with the call.
    call_extras: CallExtras,
}

type CallExtras = Arc<Mutex<HashMap<String, Value>>>;

/// One of our messages as chat messages. A tool result is a message of its
/// own, and must directly follow the assistant message that called the tool,
/// so results come before any text in the same message. Reasoning this
/// provider sent goes back with its message, since some reject a later tool
/// turn without it; another provider's signed thinking is left out.
fn to_chat_messages(message: &ChatMessage, extras: &HashMap<String, Value>) -> Vec<Value> {
    let mut text = String::new();
    let mut reasoning = String::new();
    let mut calls = Vec::new();
    let mut out = Vec::new();
    for block in &message.content {
        match block {
            ContentBlock::Text { text: piece } => text.push_str(piece),
            ContentBlock::ToolUse { id, name, input } => {
                let mut call = json!({
                    "id": id,
                    "type": "function",
                    "function": { "name": name, "arguments": input.to_string() },
                });
                if let Some(extra) = extras.get(id) {
                    call["extra_content"] = extra.clone();
                }
                calls.push(call);
            }
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
            ContentBlock::Thinking {
                thinking,
                signature,
            } if signature.is_empty() => reasoning.push_str(thinking),
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
    if !reasoning.is_empty() {
        if let Some(last) = out.last_mut().filter(|m| m["role"] == "assistant") {
            last["reasoning_content"] = json!(reasoning);
        }
    }
    out
}

/// The system prompt, then the conversation.
fn chat_messages(request: &ModelRequest, extras: &HashMap<String, Value>) -> Vec<Value> {
    let system = request
        .system
        .iter()
        .map(|text| json!({ "role": "system", "content": text }));
    system
        .chain(
            request
                .messages
                .iter()
                .flat_map(|message| to_chat_messages(message, extras)),
        )
        .collect()
}

fn request_body(
    client: &OpenAiCompatClient,
    extras: &HashMap<String, Value>,
    request: &ModelRequest,
) -> Value {
    let mut body = json!({
        "model": client.model,
        "stream": true,
        "messages": chat_messages(request, extras),
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
    if let Some(max_tokens) = request.max_tokens.or(client.max_tokens) {
        body[client.max_tokens_field] = json!(max_tokens);
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
    extra: Option<Value>,
}

/// Turns the chat completions event stream into model events: text deltas as
/// they arrive, then the whole message once the stream ends.
#[derive(Default)]
struct StreamAssembler {
    text: String,
    reasoning: String,
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
        if let Some(piece) = delta["reasoning_content"].as_str() {
            self.reasoning.push_str(piece);
        }
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
        if !fragment["extra_content"].is_null() {
            call.extra = Some(fragment["extra_content"].clone());
        }
        if let Some(arguments) = function["arguments"].as_str() {
            call.arguments.push_str(arguments);
        }
    }

    /// The finished message, plus the extra data to send back with each call.
    fn finish(self) -> (ModelEvent, Vec<(String, Value)>) {
        let mut content = Vec::new();
        let mut extras = Vec::new();
        if !self.reasoning.is_empty() {
            // No signature: this is what marks it as this provider's own.
            content.push(ContentBlock::Thinking {
                thinking: self.reasoning,
                signature: String::new(),
            });
        }
        if !self.text.is_empty() {
            content.push(ContentBlock::Text { text: self.text });
        }
        for (i, call) in self.calls.into_iter().enumerate() {
            // The result has to name the call, so each needs some id.
            let id = if call.id.is_empty() {
                format!("call_{i}")
            } else {
                call.id
            };
            if let Some(extra) = call.extra {
                extras.push((id.clone(), extra));
            }
            content.push(ContentBlock::ToolUse {
                id: id.clone(),
                name: call.name,
                // An unparsable input leaves the tool without arguments; the
                // tool then reports what is missing to the model.
                input: serde_json::from_str(&call.arguments).unwrap_or_else(|_| json!({})),
            });
        }
        (ModelEvent::Message(content), extras)
    }
}

/// The reason in an error body; these APIs do not agree on where it goes.
pub(crate) fn error_message(body: &Value) -> Option<String> {
    // Some wrap the whole body in an array.
    let body = body.get(0).unwrap_or(body);
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
            provider: self.provider.clone(),
        })?;
        let (path, body) = if self.responses {
            let body = responses::request_body(&self.model, self.max_tokens, &request);
            ("responses", body)
        } else {
            let extras = self.call_extras.lock().unwrap();
            ("chat/completions", request_body(self, &extras, &request))
        };
        let mut response = self
            .http
            .post(format!("{}/{path}", self.base_url))
            .bearer_auth(key)
            .header("accept", "text/event-stream")
            .json(&body)
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
        let mut chat = StreamAssembler::default();
        let mut other = responses::ResponsesAssembler::default();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| ModelError::Stream(e.to_string()))?
        {
            for event in parser.push(&chunk) {
                let handled = if self.responses {
                    other.handle(&event.data)?
                } else {
                    chat.handle(&event.data)?
                };
                for model_event in handled {
                    if tx.send(Ok(model_event)).await.is_err() {
                        // The turn was dropped; stop reading the stream.
                        return Ok(());
                    }
                }
            }
        }
        if self.responses {
            let _ = tx.send(Ok(other.finish())).await;
            return Ok(());
        }
        let (message, extras) = chat.finish();
        self.call_extras.lock().unwrap().extend(extras);
        let _ = tx.send(Ok(message)).await;
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

    fn client(field: &'static str, max_tokens: Option<u32>) -> OpenAiCompatClient {
        OpenAiCompatClient {
            http: reqwest::Client::new(),
            provider: "P".into(),
            base_url: "http://unused".into(),
            max_tokens_field: field,
            responses: false,
            key: Arc::default(),
            model: "m1".into(),
            max_tokens,
            call_extras: Arc::default(),
        }
    }

    fn body(max_tokens: Option<u32>, request: &ModelRequest) -> Value {
        request_body(&client("max_tokens", max_tokens), &HashMap::new(), request)
    }

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
        let body = body(Some(64_000), &request(Some(High)));
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
        let body = body(None, &request(None));
        assert!(body.get("reasoning_effort").is_none());
        assert!(body.get("max_tokens").is_none());
    }

    #[test]
    fn a_request_cap_wins_over_the_models_limit() {
        let mut capped = request(None);
        capped.max_tokens = Some(1);
        assert_eq!(body(Some(64_000), &capped)["max_tokens"], 1);
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
            assembler.finish().0,
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
            assembler.finish().0,
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
        let (ModelEvent::Message(content), _) = assembler.finish() else {
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
            assembler.finish().0,
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
        let body = body(None, &req);
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
    fn providers_that_need_it_get_their_tool_call_data_and_reasoning_back() {
        let mut assembler = StreamAssembler::default();
        for chunk in [
            json!({ "choices": [{ "delta": { "reasoning_content": "Let me " } }] }),
            json!({ "choices": [{ "delta": { "reasoning_content": "look." } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [{
                "index": 0, "id": "a", "function": { "name": "read_file", "arguments": "{}" },
                "extra_content": { "google": { "thought_signature": "sig" } },
            }] } }] }),
        ] {
            assembler.handle(&chunk.to_string()).unwrap();
        }
        let (ModelEvent::Message(content), extras) = assembler.finish() else {
            panic!("expected a message");
        };
        let replay = ModelRequest {
            messages: vec![ChatMessage::assistant(content)],
            tools: vec![],
            system: None,
            effort: None,
            max_tokens: None,
        };

        let body = request_body(
            &client("max_tokens", None),
            &extras.into_iter().collect(),
            &replay,
        );

        let message = &body["messages"][0];
        assert_eq!(message["reasoning_content"], "Let me look.");
        assert_eq!(
            message["tool_calls"][0]["extra_content"]["google"]["thought_signature"],
            "sig"
        );
    }

    #[test]
    fn another_providers_signed_thinking_stays_out() {
        let body = body(None, &request(None));
        assert!(body["messages"][2].get("reasoning_content").is_none());
    }

    #[test]
    fn the_reply_cap_uses_the_field_the_provider_expects() {
        let body = request_body(
            &client("max_completion_tokens", Some(64_000)),
            &HashMap::new(),
            &request(None),
        );
        assert_eq!(body["max_completion_tokens"], 64_000);
        assert!(body.get("max_tokens").is_none());
    }

    #[test]
    fn a_custom_base_url_must_protect_the_key() {
        assert_eq!(
            check_base_url(" https://gw.example.com/v1/ ").as_deref(),
            Ok("https://gw.example.com/v1")
        );
        assert!(check_base_url("http://localhost:8000/v1").is_ok());
        assert!(check_base_url("http://127.0.0.1:8000/v1").is_ok());
        assert!(check_base_url("http://gw.example.com/v1").is_err());
        assert!(check_base_url("ftp://gw.example.com").is_err());
        assert!(check_base_url("gw.example.com").is_err());
    }

    #[test]
    fn a_custom_provider_lists_its_models_without_an_effort_setting() {
        let provider = OpenAiCompatProvider::custom(
            "custom-gw",
            "My GW",
            "https://x",
            false,
            &[ProviderModel {
                id: "a".into(),
                name: "a".into(),
            }],
        );
        assert_eq!(provider.id(), "custom-gw");
        assert_eq!(provider.models()[0].id, "a");
        assert!(provider.models()[0].efforts.is_empty());
        assert!(!provider.is_configured());
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
            json!([{ "error": { "code": 400, "message": "no" } }]),
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
