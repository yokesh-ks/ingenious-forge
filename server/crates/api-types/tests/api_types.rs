use api_types::{
    typescript_bindings, ClientMessage, MessageSource, SessionEvent, TurnEndReason, Usage,
};
use serde_json::json;

const GENERATED_TS: &str = "../../../apps/web/src/api/types.ts";

#[test]
fn client_send_message_uses_snake_case_tag() {
    let msg: ClientMessage = serde_json::from_value(json!({
        "type": "send_message",
        "session_id": "s1",
        "text": "hello"
    }))
    .unwrap();
    assert_eq!(
        msg,
        ClientMessage::SendMessage {
            session_id: "s1".into(),
            text: "hello".into()
        }
    );
}

#[test]
fn client_message_rejects_unknown_type() {
    let result: Result<ClientMessage, _> =
        serde_json::from_value(json!({ "type": "nope", "session_id": "s1" }));
    assert!(result.is_err());
}

#[test]
fn output_event_serializes_with_type_tag() {
    let event = SessionEvent::Output {
        session_id: "s1".into(),
        chunk: "Hi".into(),
    };
    assert_eq!(
        serde_json::to_value(&event).unwrap(),
        json!({ "type": "output", "session_id": "s1", "chunk": "Hi" })
    );
}

#[test]
fn error_event_serializes_with_message() {
    let event = SessionEvent::Error {
        session_id: "s1".into(),
        message: "boom".into(),
    };
    assert_eq!(
        serde_json::to_value(&event).unwrap(),
        json!({ "type": "error", "session_id": "s1", "message": "boom" })
    );
}

#[test]
fn event_session_id_accessor_covers_every_variant() {
    let events = [
        SessionEvent::TurnStarted {
            session_id: "a".into(),
            turn: 1,
        },
        SessionEvent::StepStarted {
            session_id: "a".into(),
            turn: 1,
            step: 1,
        },
        SessionEvent::StepEnded {
            session_id: "a".into(),
            turn: 1,
            step: 1,
            usage: None,
            first_token_ms: None,
            generation_ms: None,
        },
        SessionEvent::TurnEnded {
            session_id: "a".into(),
            turn: 1,
            reason: TurnEndReason::Completed,
        },
        SessionEvent::Output {
            session_id: "a".into(),
            chunk: String::new(),
        },
        SessionEvent::Error {
            session_id: "a".into(),
            message: String::new(),
        },
        SessionEvent::ToolCall {
            session_id: "a".into(),
            call_id: "c".into(),
            name: "read".into(),
            args: json!({}),
            turn: 1,
            step: 1,
        },
        SessionEvent::ToolResult {
            session_id: "a".into(),
            call_id: "c".into(),
            output: String::new(),
            is_error: false,
            exit_code: None,
            meta: None,
            started_at: 0,
            ended_at: 0,
        },
        SessionEvent::Done {
            session_id: "a".into(),
        },
    ];
    for event in events {
        assert_eq!(event.session_id(), "a");
    }
}

#[test]
fn tool_call_and_result_share_a_call_id() {
    let call = SessionEvent::ToolCall {
        session_id: "s1".into(),
        call_id: "toolu_1".into(),
        name: "read".into(),
        args: json!({ "file_path": "README.md" }),
        turn: 2,
        step: 1,
    };
    let result = SessionEvent::ToolResult {
        session_id: "s1".into(),
        call_id: "toolu_1".into(),
        output: "# Forge".into(),
        is_error: false,
        exit_code: None,
        meta: Some(json!({ "total_lines": 1 })),
        started_at: 10,
        ended_at: 45,
    };
    assert_eq!(
        serde_json::to_value(&call).unwrap(),
        json!({
            "type": "tool_call",
            "session_id": "s1",
            "call_id": "toolu_1",
            "name": "read",
            "args": { "file_path": "README.md" },
            "turn": 2,
            "step": 1
        })
    );
    assert_eq!(
        serde_json::to_value(&result).unwrap(),
        json!({
            "type": "tool_result",
            "session_id": "s1",
            "call_id": "toolu_1",
            "output": "# Forge",
            "is_error": false,
            "exit_code": null,
            "meta": { "total_lines": 1 },
            "started_at": 10,
            "ended_at": 45
        })
    );
}

#[test]
fn bindings_declare_every_payload_type() {
    let ts = typescript_bindings();
    assert!(ts.contains("export type SessionEvent"));
    assert!(ts.contains("export type ClientMessage"));
    assert!(ts.contains("\"type\": \"output\""));
    assert!(ts.contains("\"type\": \"send_message\""));
}

#[test]
fn bindings_declare_every_type_they_reference() {
    let ts = typescript_bindings();
    if ts.contains("JsonValue") {
        assert!(
            ts.contains("export type JsonValue"),
            "JsonValue is used but not declared"
        );
    }
}

/// The frontend's types are generated from this crate. Run
/// `UPDATE_API_TYPES=1 cargo test -p api-types` to regenerate them; CI runs
/// this test without the variable, so a drift fails the build.
#[test]
fn generated_typescript_matches_committed_file() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(GENERATED_TS);
    let expected = typescript_bindings();
    if std::env::var_os("UPDATE_API_TYPES").is_some() {
        std::fs::write(&path, &expected).unwrap();
        return;
    }
    let committed = std::fs::read_to_string(&path).unwrap_or_default();
    assert!(
        committed == expected,
        "{} is out of date; run `UPDATE_API_TYPES=1 cargo test -p api-types`",
        path.display()
    );
}

#[test]
fn client_interrupt_parses() {
    let msg: ClientMessage =
        serde_json::from_value(json!({ "type": "interrupt", "session_id": "s1" })).unwrap();
    assert_eq!(
        msg,
        ClientMessage::Interrupt {
            session_id: "s1".into()
        }
    );
}

#[test]
fn interrupted_event_serializes() {
    let event = SessionEvent::Interrupted {
        session_id: "s1".into(),
    };
    assert_eq!(event.session_id(), "s1");
    assert_eq!(
        serde_json::to_value(&event).unwrap(),
        json!({ "type": "interrupted", "session_id": "s1" })
    );
}

#[test]
fn file_changed_event_carries_the_diff() {
    let event = SessionEvent::FileChanged {
        session_id: "s1".into(),
        path: "a.txt".into(),
        diff: "--- a/a.txt\n".into(),
        additions: 2,
        deletions: 1,
    };
    assert_eq!(event.session_id(), "s1");
    assert_eq!(
        serde_json::to_value(&event).unwrap(),
        json!({
            "type": "file_changed",
            "session_id": "s1",
            "path": "a.txt",
            "diff": "--- a/a.txt\n",
            "additions": 2,
            "deletions": 1
        })
    );
}

#[test]
fn revert_all_and_changes_reverted_round_trip() {
    let msg: ClientMessage =
        serde_json::from_value(json!({ "type": "revert_all", "session_id": "s1" })).unwrap();
    assert_eq!(
        msg,
        ClientMessage::RevertAll {
            session_id: "s1".into()
        }
    );
    let event = SessionEvent::ChangesReverted {
        session_id: "s1".into(),
        paths: vec!["a.txt".into()],
    };
    assert_eq!(event.session_id(), "s1");
    assert_eq!(
        serde_json::to_value(&event).unwrap(),
        json!({ "type": "changes_reverted", "session_id": "s1", "paths": ["a.txt"] })
    );
}

#[test]
fn project_and_picked_folder_types_serialize_as_the_frontend_expects() {
    use api_types::{PickedFolder, Project};
    let project = Project {
        id: "p1".into(),
        name: "forge".into(),
        path: "/code/forge".into(),
        last_opened_at: 1_700_000_000_000,
    };
    assert_eq!(
        serde_json::to_value(&project).unwrap(),
        json!({ "id": "p1", "name": "forge", "path": "/code/forge", "last_opened_at": 1_700_000_000_000_i64 })
    );
    assert_eq!(
        serde_json::to_value(PickedFolder { path: None }).unwrap(),
        json!({ "path": null })
    );
    let ts = typescript_bindings();
    assert!(ts.contains("last_opened_at: number"), "{ts}");
    assert!(ts.contains("export type OpenProjectRequest"));
    assert!(ts.contains("export type ApiError"));
}

#[test]
fn an_envelope_puts_seq_beside_the_event_fields() {
    let envelope = api_types::SessionEnvelope {
        seq: 7,
        ts: 1_700_000_000_000,
        event: SessionEvent::Done {
            session_id: "s1".into(),
        },
    };
    let value = serde_json::to_value(&envelope).unwrap();
    assert_eq!(
        value,
        json!({ "seq": 7, "ts": 1_700_000_000_000u64, "type": "done", "session_id": "s1" })
    );
    let back: api_types::SessionEnvelope = serde_json::from_value(value).unwrap();
    assert_eq!((back.seq, back.ts), (7, 1_700_000_000_000));
    assert!(typescript_bindings().contains("export type SessionEnvelope"));
}

#[test]
fn an_envelope_without_a_timestamp_reads_as_zero() {
    let back: api_types::SessionEnvelope =
        serde_json::from_value(json!({ "seq": 1, "type": "turn_started", "session_id": "s1" }))
            .unwrap();
    assert_eq!(back.ts, 0);
    assert!(matches!(
        back.event,
        SessionEvent::TurnStarted { turn: 0, .. }
    ));
}

#[test]
fn turn_and_step_events_serialize() {
    let ended = SessionEvent::TurnEnded {
        session_id: "s1".into(),
        turn: 2,
        reason: TurnEndReason::Error {
            code: "PROVIDER_ERROR".into(),
            message: "boom".into(),
        },
    };
    assert_eq!(
        serde_json::to_value(&ended).unwrap(),
        json!({
            "type": "turn_ended",
            "session_id": "s1",
            "turn": 2,
            "reason": { "kind": "error", "code": "PROVIDER_ERROR", "message": "boom" }
        })
    );
    let step = SessionEvent::StepEnded {
        session_id: "s1".into(),
        turn: 2,
        step: 1,
        usage: Some(Usage {
            input: 10,
            output: 5,
            cache_read: 3,
            cache_write: 0,
        }),
        first_token_ms: Some(120),
        generation_ms: None,
    };
    assert_eq!(
        serde_json::to_value(&step).unwrap(),
        json!({
            "type": "step_ended",
            "session_id": "s1",
            "turn": 2,
            "step": 1,
            "usage": { "input": 10, "output": 5, "cache_read": 3, "cache_write": 0 },
            "first_token_ms": 120,
            "generation_ms": null
        })
    );
    let ts = typescript_bindings();
    assert!(ts.contains("export type TurnEndReason"));
    assert!(ts.contains("export type Usage"));
}

#[test]
fn user_message_event_serializes() {
    let event = SessionEvent::UserMessage {
        session_id: "s1".into(),
        text: "hi".into(),
        source: MessageSource::Steering,
    };
    assert_eq!(event.session_id(), "s1");
    assert_eq!(
        serde_json::to_value(&event).unwrap(),
        json!({ "type": "user_message", "session_id": "s1", "text": "hi", "source": "steering" })
    );
    // Messages logged before sources read as typed by a human.
    let old: SessionEvent =
        serde_json::from_value(json!({ "type": "user_message", "session_id": "s1", "text": "x" }))
            .unwrap();
    assert!(matches!(
        old,
        SessionEvent::UserMessage {
            source: MessageSource::Human,
            ..
        }
    ));
}

#[test]
fn session_model_and_catalog_serialize_as_the_frontend_expects() {
    use api_types::{
        CreateSessionRequest, ModelCatalog, ModelOption, ProviderOption, ReasoningEffort,
        SessionModel,
    };
    let model = SessionModel {
        provider: "anthropic".into(),
        model: "claude-opus-5-5".into(),
        effort: ReasoningEffort::Xhigh,
    };
    assert_eq!(
        serde_json::to_value(&model).unwrap(),
        json!({ "provider": "anthropic", "model": "claude-opus-5-5", "effort": "xhigh" })
    );
    assert_eq!(ReasoningEffort::default(), ReasoningEffort::High);
    assert_eq!(ReasoningEffort::ALL.len(), 5);
    assert_eq!(ReasoningEffort::Max.as_str(), "max");
    assert_eq!(
        "medium".parse::<ReasoningEffort>(),
        Ok(ReasoningEffort::Medium)
    );
    assert!("huge".parse::<ReasoningEffort>().is_err());

    // A request without a body field picks the default model.
    let empty: CreateSessionRequest = serde_json::from_value(json!({})).unwrap();
    assert_eq!(empty.model, None);

    let catalog = ModelCatalog {
        providers: vec![ProviderOption {
            id: "anthropic".into(),
            name: "Anthropic".into(),
            models: vec![ModelOption {
                id: "claude-opus-5-5".into(),
                name: "Claude Opus 5.5".into(),
                efforts: ReasoningEffort::ALL.to_vec(),
            }],
        }],
        default: Some(model),
    };
    let value = serde_json::to_value(&catalog).unwrap();
    assert_eq!(
        value["providers"][0]["models"][0]["efforts"],
        json!(["low", "medium", "high", "xhigh", "max"])
    );
    assert_eq!(
        value["providers"][0]["models"][0]["name"],
        "Claude Opus 5.5"
    );

    let ts = typescript_bindings();
    assert!(ts.contains("export type ReasoningEffort"), "{ts}");
    assert!(ts.contains("export type ModelCatalog"), "{ts}");
    assert!(ts.contains("export type CreateSessionRequest"), "{ts}");
    assert!(ts.contains("model: SessionModel | null"), "{ts}");
}

#[test]
fn tool_output_lines_and_exit_codes_serialize() {
    use api_types::OutputStream;
    let line = SessionEvent::ToolOutput {
        session_id: "s".into(),
        call_id: "t1".into(),
        stream: OutputStream::Stderr,
        text: "oops".into(),
    };
    assert_eq!(
        serde_json::to_value(&line).unwrap(),
        json!({ "type": "tool_output", "session_id": "s", "call_id": "t1", "stream": "stderr", "text": "oops" })
    );
    assert_eq!(line.session_id(), "s");

    let result = SessionEvent::ToolResult {
        session_id: "s".into(),
        call_id: "t1".into(),
        output: "done".into(),
        is_error: false,
        exit_code: Some(2),
        meta: None,
        started_at: 0,
        ended_at: 0,
    };
    assert_eq!(serde_json::to_value(&result).unwrap()["exit_code"], 2);
    // Results logged before exit codes existed still load.
    let old: SessionEvent = serde_json::from_value(json!({
        "type": "tool_result", "session_id": "s", "call_id": "t1", "output": "x", "is_error": false
    }))
    .unwrap();
    assert!(matches!(
        old,
        SessionEvent::ToolResult {
            exit_code: None,
            meta: None,
            started_at: 0,
            ended_at: 0,
            ..
        }
    ));
}

#[test]
fn approval_modes_serialize_in_snake_case() {
    use api_types::{ApprovalMode, SetApprovalModeRequest};
    assert_eq!(ApprovalMode::default(), ApprovalMode::Ask);
    assert_eq!(
        serde_json::to_value(ApprovalMode::AutoEdit).unwrap(),
        "auto_edit"
    );
    assert_eq!(
        serde_json::to_value(ApprovalMode::FullAuto).unwrap(),
        "full_auto"
    );
    assert_eq!(
        "full_auto".parse::<ApprovalMode>(),
        Ok(ApprovalMode::FullAuto)
    );
    assert!("never".parse::<ApprovalMode>().is_err());
    let body: SetApprovalModeRequest = serde_json::from_value(json!({ "mode": "ask" })).unwrap();
    assert_eq!(body.mode, ApprovalMode::Ask);

    let changed = SessionEvent::ApprovalModeChanged {
        session_id: "s".into(),
        mode: ApprovalMode::AutoEdit,
    };
    assert_eq!(
        serde_json::to_value(&changed).unwrap(),
        json!({ "type": "approval_mode_changed", "session_id": "s", "mode": "auto_edit" })
    );
    assert_eq!(changed.session_id(), "s");
    assert!(typescript_bindings().contains("export type ApprovalMode"));
}

#[test]
fn approval_requests_and_answers_serialize() {
    use api_types::{ApprovalDecision, ApprovalKind};
    let request = SessionEvent::ApprovalRequested {
        session_id: "s".into(),
        call_id: "t1".into(),
        kind: ApprovalKind::Command,
        command: Some("ls".into()),
        path: None,
        diff: None,
    };
    assert_eq!(
        serde_json::to_value(&request).unwrap(),
        json!({ "type": "approval_requested", "session_id": "s", "call_id": "t1",
                "kind": "command", "command": "ls", "path": null, "diff": null })
    );
    let resolved = SessionEvent::ApprovalResolved {
        session_id: "s".into(),
        call_id: "t1".into(),
        decision: ApprovalDecision::AlwaysAllow,
    };
    assert_eq!(
        serde_json::to_value(&resolved).unwrap()["decision"],
        "always_allow"
    );
    assert_eq!(resolved.session_id(), "s");

    let answer: ClientMessage = serde_json::from_value(json!({
        "type": "answer_approval", "session_id": "s", "call_id": "t1", "decision": "deny"
    }))
    .unwrap();
    assert_eq!(
        answer,
        ClientMessage::AnswerApproval {
            session_id: "s".into(),
            call_id: "t1".into(),
            decision: ApprovalDecision::Deny
        }
    );
}

#[test]
fn file_list_and_content_serialize() {
    use api_types::{FileContent, FileList};
    let list = FileList {
        files: vec!["a.rs".into()],
        truncated: false,
    };
    assert_eq!(
        serde_json::to_value(&list).unwrap(),
        json!({ "files": ["a.rs"], "truncated": false })
    );
    let file = FileContent {
        path: "a.rs".into(),
        content: "x".into(),
    };
    assert_eq!(
        serde_json::to_value(&file).unwrap(),
        json!({ "path": "a.rs", "content": "x" })
    );
    let ts = typescript_bindings();
    assert!(ts.contains("export type FileList") && ts.contains("export type FileContent"));
}

#[test]
fn terminal_input_and_exit_serialize() {
    use api_types::{TerminalInput, TerminalNotice};
    let input: TerminalInput =
        serde_json::from_value(json!({ "type": "input", "data": "ls\r" })).unwrap();
    assert_eq!(
        input,
        TerminalInput::Input {
            data: "ls\r".into()
        }
    );
    let resize: TerminalInput =
        serde_json::from_value(json!({ "type": "resize", "cols": 80, "rows": 24 })).unwrap();
    assert_eq!(resize, TerminalInput::Resize { cols: 80, rows: 24 });
    assert_eq!(
        serde_json::to_value(TerminalNotice::Exit).unwrap(),
        json!({ "type": "exit" })
    );
    assert!(typescript_bindings().contains("export type TerminalInput"));
}

#[test]
fn sandbox_info_serializes() {
    use api_types::SandboxInfo;
    let info = SandboxInfo {
        name: "bubblewrap".into(),
        active: true,
        writable: vec!["/work/app".into()],
        network: false,
        problem: None,
    };
    assert_eq!(
        serde_json::to_value(&info).unwrap(),
        json!({ "name": "bubblewrap", "active": true, "writable": ["/work/app"], "network": false, "problem": null })
    );
    let changed = SessionEvent::SandboxChanged {
        session_id: "s".into(),
        sandbox: info,
    };
    assert_eq!(
        serde_json::to_value(&changed).unwrap()["type"],
        "sandbox_changed"
    );
    assert_eq!(changed.session_id(), "s");
}
