//! The OpenAI Responses API format, for custom providers that speak it: how a
//! request is written and how the event stream becomes model events.

use serde_json::{json, Value};

use crate::model::{ChatMessage, ContentBlock, ModelError, ModelEvent, ModelRequest, Role};
use crate::openai_compat::error_message;

/// One of our messages as input items. Each tool call and result is an item of
/// its own, in order. Thinking blocks are another format and are left out.
fn input_items(message: &ChatMessage) -> Vec<Value> {
    let role = match message.role {
        Role::User => "user",
        Role::Assistant => "assistant",
    };
    message
        .content
        .iter()
        .filter_map(|block| match block {
            ContentBlock::Text { text } => Some(json!({ "role": role, "content": text })),
            ContentBlock::ToolUse { id, name, input } => Some(json!({
                "type": "function_call",
                "call_id": id,
                "name": name,
                "arguments": input.to_string(),
            })),
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => Some(json!({
                "type": "function_call_output",
                "call_id": tool_use_id,
                // The format has no error flag, so the text has to say it.
                "output": if *is_error { format!("Error: {content}") } else { content.clone() },
            })),
            ContentBlock::Thinking { .. } | ContentBlock::RedactedThinking { .. } => None,
        })
        .collect()
}

pub(crate) fn request_body(model: &str, max_tokens: Option<u32>, request: &ModelRequest) -> Value {
    let input: Vec<Value> = request.messages.iter().flat_map(input_items).collect();
    let mut body = json!({
        "model": model,
        "stream": true,
        // Forge keeps the conversation and sends all of it every time.
        "store": false,
        "input": input,
    });
    if !request.tools.is_empty() {
        let tools: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                })
            })
            .collect();
        body["tools"] = json!(tools);
    }
    if let Some(system) = &request.system {
        body["instructions"] = json!(system);
    }
    if let Some(max_tokens) = request.max_tokens.or(max_tokens) {
        body["max_output_tokens"] = json!(max_tokens);
    }
    if let Some(effort) = request.effort {
        body["reasoning"] = json!({ "effort": effort.as_str() });
    }
    body
}

/// A tool call while its arguments are still arriving.
#[derive(Default)]
struct PartialCall {
    call_id: String,
    name: String,
    arguments: String,
}

/// Turns the Responses event stream into model events: text deltas as they
/// arrive, then the whole message once the stream ends.
#[derive(Default)]
pub(crate) struct ResponsesAssembler {
    text: String,
    calls: Vec<(u64, PartialCall)>,
}

impl ResponsesAssembler {
    fn call_at(&mut self, index: u64) -> &mut PartialCall {
        let position = match self.calls.iter().position(|(i, _)| *i == index) {
            Some(position) => position,
            None => {
                self.calls.push((index, PartialCall::default()));
                self.calls.len() - 1
            }
        };
        &mut self.calls[position].1
    }

    pub(crate) fn handle(&mut self, data: &str) -> Result<Vec<ModelEvent>, ModelError> {
        if data.trim() == "[DONE]" {
            return Ok(Vec::new());
        }
        let event: Value =
            serde_json::from_str(data).map_err(|e| ModelError::Stream(e.to_string()))?;
        let index = event["output_index"].as_u64().unwrap_or_default();
        match event["type"].as_str() {
            Some("response.output_text.delta") => {
                let piece = event["delta"].as_str().unwrap_or_default();
                if !piece.is_empty() {
                    self.text.push_str(piece);
                    return Ok(vec![ModelEvent::TextDelta(piece.to_string())]);
                }
            }
            Some("response.output_item.added") if event["item"]["type"] == "function_call" => {
                let item = &event["item"];
                let call = self.call_at(index);
                call.call_id = item["call_id"].as_str().unwrap_or_default().to_string();
                call.name = item["name"].as_str().unwrap_or_default().to_string();
                call.arguments = item["arguments"].as_str().unwrap_or_default().to_string();
            }
            Some("response.function_call_arguments.delta") => {
                let piece = event["delta"].as_str().unwrap_or_default();
                self.call_at(index).arguments.push_str(piece);
            }
            Some("response.function_call_arguments.done") => {
                if let Some(arguments) = event["arguments"].as_str() {
                    self.call_at(index).arguments = arguments.to_string();
                }
            }
            Some("response.refusal.done") => return Err(ModelError::Refusal),
            Some("response.failed") => {
                return Err(ModelError::Stream(
                    error_message(&event["response"])
                        .unwrap_or_else(|| "the provider reported an error".to_string()),
                ));
            }
            Some("error") => {
                return Err(ModelError::Stream(
                    error_message(&event)
                        .unwrap_or_else(|| "the provider reported an error".to_string()),
                ));
            }
            _ => {}
        }
        Ok(Vec::new())
    }

    pub(crate) fn finish(self) -> ModelEvent {
        let mut content = Vec::new();
        if !self.text.is_empty() {
            content.push(ContentBlock::Text { text: self.text });
        }
        for (i, (_, call)) in self.calls.into_iter().enumerate() {
            content.push(ContentBlock::ToolUse {
                // The result has to name the call, so each needs some id.
                id: if call.call_id.is_empty() {
                    format!("call_{i}")
                } else {
                    call.call_id
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::ToolSpec;

    #[test]
    fn a_request_uses_the_responses_format() {
        let request = ModelRequest {
            messages: vec![
                ChatMessage::user_text("Hi"),
                ChatMessage::assistant(vec![
                    ContentBlock::Thinking {
                        thinking: "hmm".into(),
                        signature: "sig".into(),
                    },
                    ContentBlock::Text {
                        text: "Reading.".into(),
                    },
                    ContentBlock::ToolUse {
                        id: "a".into(),
                        name: "read_file".into(),
                        input: json!({ "path": "a.rs" }),
                    },
                ]),
                ChatMessage::user(vec![ContentBlock::ToolResult {
                    tool_use_id: "a".into(),
                    content: "no such file".into(),
                    is_error: true,
                }]),
            ],
            tools: vec![ToolSpec {
                name: "read_file",
                description: "Reads a file",
                input_schema: json!({ "type": "object" }),
            }],
            system: Some("Be brief.".into()),
            effort: Some(api_types::ReasoningEffort::Low),
            max_tokens: Some(5),
        };

        let body = request_body("m1", Some(64_000), &request);

        assert_eq!(body["model"], "m1");
        assert_eq!(body["store"], false);
        assert_eq!(body["instructions"], "Be brief.");
        assert_eq!(body["max_output_tokens"], 5);
        assert_eq!(body["reasoning"], json!({ "effort": "low" }));
        assert_eq!(
            body["tools"],
            json!([{
                "type": "function",
                "name": "read_file",
                "description": "Reads a file",
                "parameters": { "type": "object" },
            }])
        );
        assert_eq!(
            body["input"],
            json!([
                { "role": "user", "content": "Hi" },
                { "role": "assistant", "content": "Reading." },
                {
                    "type": "function_call",
                    "call_id": "a",
                    "name": "read_file",
                    "arguments": "{\"path\":\"a.rs\"}",
                },
                { "type": "function_call_output", "call_id": "a", "output": "Error: no such file" },
            ])
        );
    }

    #[test]
    fn text_and_tool_calls_are_assembled_from_the_stream() {
        let mut assembler = ResponsesAssembler::default();
        let mut deltas = Vec::new();
        for event in [
            json!({ "type": "response.created" }),
            json!({ "type": "response.output_text.delta", "output_index": 0, "delta": "Hel" }),
            json!({ "type": "response.output_text.delta", "output_index": 0, "delta": "lo" }),
            json!({ "type": "response.output_item.added", "output_index": 1, "item": {
                "type": "function_call", "call_id": "c1", "name": "read_file", "arguments": "",
            } }),
            json!({ "type": "response.function_call_arguments.delta", "output_index": 1, "delta": "{\"pa" }),
            json!({ "type": "response.function_call_arguments.delta", "output_index": 1, "delta": "th\":\"a\"}" }),
            json!({ "type": "response.output_item.added", "output_index": 2, "item": {
                "type": "function_call", "call_id": "c2", "name": "list_dir", "arguments": "",
            } }),
            json!({ "type": "response.function_call_arguments.done", "output_index": 2, "arguments": "{}" }),
            json!({ "type": "response.completed" }),
        ] {
            deltas.extend(assembler.handle(&event.to_string()).unwrap());
        }
        assert_eq!(
            deltas,
            [
                ModelEvent::TextDelta("Hel".into()),
                ModelEvent::TextDelta("lo".into()),
            ]
        );
        assert_eq!(
            assembler.finish(),
            ModelEvent::Message(vec![
                ContentBlock::Text {
                    text: "Hello".into()
                },
                ContentBlock::ToolUse {
                    id: "c1".into(),
                    name: "read_file".into(),
                    input: json!({ "path": "a" }),
                },
                ContentBlock::ToolUse {
                    id: "c2".into(),
                    name: "list_dir".into(),
                    input: json!({}),
                },
            ])
        );
    }

    #[test]
    fn failures_in_the_stream_are_reported() {
        let mut assembler = ResponsesAssembler::default();
        let failed = json!({
            "type": "response.failed",
            "response": { "error": { "message": "overloaded" } },
        });
        assert_eq!(
            assembler.handle(&failed.to_string()),
            Err(ModelError::Stream("overloaded".into()))
        );
        assert_eq!(
            assembler.handle(&json!({ "type": "error", "message": "bad" }).to_string()),
            Err(ModelError::Stream("bad".into()))
        );
        assert_eq!(
            assembler.handle(&json!({ "type": "response.refusal.done" }).to_string()),
            Err(ModelError::Refusal)
        );
        assert!(matches!(
            assembler.handle("not json"),
            Err(ModelError::Stream(_))
        ));
    }
}
