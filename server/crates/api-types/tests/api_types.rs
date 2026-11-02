use api_types::{typescript_bindings, ClientMessage, SessionEvent};
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
        },
        SessionEvent::Output {
            session_id: "a".into(),
            chunk: String::new(),
        },
        SessionEvent::Error {
            session_id: "a".into(),
            message: String::new(),
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
