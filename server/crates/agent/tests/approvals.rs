//! Approval modes (PRD §6.1 Approval modes; §6.2 approval cards): in Ask
//! mode every edit and command waits for the user; Auto-edit asks only for
//! commands; Full-auto never asks.

use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    tools::{ToolBox, EDIT_FILE, READ_FILE, RUN_SHELL},
    Agent,
};
use api_types::{
    ApprovalDecision, ApprovalKind, ApprovalMode, SessionEnvelope, SessionEvent, TurnEndReason,
};
use serde_json::{json, Value};
use services::EventService;
use tokio::sync::{broadcast, mpsc};

#[derive(Default)]
struct FakeModel {
    replies: Mutex<VecDeque<Vec<ModelEvent>>>,
    requests: Mutex<Vec<ModelRequest>>,
}

impl ModelClient for FakeModel {
    fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        self.requests.lock().unwrap().push(request);
        let steps = self.replies.lock().unwrap().pop_front().unwrap_or_default();
        let (tx, rx) = mpsc::channel(16);
        tokio::spawn(async move {
            for step in steps {
                if tx.send(Ok(step)).await.is_err() {
                    return;
                }
            }
        });
        rx
    }
}

fn project(files: &[(&str, &str)]) -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-approvals-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    for (name, body) in files {
        std::fs::write(dir.join(name), body).unwrap();
    }
    dir.canonicalize().unwrap()
}

fn call(id: &str, name: &str, input: Value) -> Vec<ModelEvent> {
    vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
        id: id.into(),
        name: name.into(),
        input,
    }])]
}

fn reply(text: &str) -> Vec<ModelEvent> {
    vec![ModelEvent::TextDelta(text.into())]
}

struct Session {
    agent: Agent,
    model: Arc<FakeModel>,
    rx: broadcast::Receiver<SessionEnvelope>,
    root: PathBuf,
}

fn setup(mode: ApprovalMode, files: &[(&str, &str)], replies: Vec<Vec<ModelEvent>>) -> Session {
    let model = Arc::new(FakeModel {
        replies: Mutex::new(replies.into()),
        ..FakeModel::default()
    });
    let events = EventService::new();
    let rx = events.subscribe();
    let agent = Agent::new(model.clone(), events);
    let root = project(files);
    agent.open_session("s1", ToolBox::new(&root));
    agent.set_approval_mode("s1", mode);
    Session {
        agent,
        model,
        rx,
        root,
    }
}

async fn next(rx: &mut broadcast::Receiver<SessionEnvelope>) -> SessionEvent {
    tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .expect("timed out waiting for a session event")
        .unwrap()
        .event
}

/// Events until an approval is requested; panics if the turn ends first.
async fn until_request(rx: &mut broadcast::Receiver<SessionEnvelope>) -> SessionEvent {
    loop {
        let event = next(rx).await;
        match event {
            SessionEvent::ApprovalRequested { .. } => return event,
            SessionEvent::TurnEnded { .. } => {
                panic!("the turn ended without asking: {event:?}")
            }
            _ => {}
        }
    }
}

async fn until_end(rx: &mut broadcast::Receiver<SessionEnvelope>) -> Vec<SessionEvent> {
    let mut out = Vec::new();
    loop {
        let event = next(rx).await;
        let end = matches!(event, SessionEvent::TurnEnded { .. });
        out.push(event);
        if end {
            return out;
        }
    }
}

fn asked(events: &[SessionEvent]) -> bool {
    events
        .iter()
        .any(|e| matches!(e, SessionEvent::ApprovalRequested { .. }))
}

fn results(events: &[SessionEvent]) -> Vec<(bool, String)> {
    events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::ToolResult {
                is_error, output, ..
            } => Some((*is_error, output.clone())),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn ask_mode_shows_the_edit_diff_and_waits_before_writing() {
    let mut s = setup(
        ApprovalMode::Ask,
        &[("a.txt", "old\n")],
        vec![
            call(
                "t1",
                EDIT_FILE,
                json!({"path": "a.txt", "old_string": "old", "new_string": "new"}),
            ),
            reply("done"),
        ],
    );
    s.agent.send_message("s1", "edit").unwrap();

    let request = until_request(&mut s.rx).await;
    let SessionEvent::ApprovalRequested {
        call_id,
        kind,
        path,
        diff,
        command,
        ..
    } = request
    else {
        unreachable!()
    };
    assert_eq!((call_id.as_str(), kind), ("t1", ApprovalKind::Edit));
    assert_eq!(path.as_deref(), Some("a.txt"));
    assert_eq!(command, None);
    let diff = diff.unwrap();
    assert!(diff.contains("-old") && diff.contains("+new"), "{diff}");
    // Nothing is written while the card waits.
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "old\n"
    );

    assert!(s
        .agent
        .answer_approval("s1", "t1", ApprovalDecision::Approve));
    let events = until_end(&mut s.rx).await;

    assert!(matches!(
        &events[0],
        SessionEvent::ApprovalResolved { call_id, decision: ApprovalDecision::Approve, .. } if call_id == "t1"
    ));
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "new\n"
    );
    assert!(!results(&events)[0].0);
}

#[tokio::test]
async fn deny_skips_the_command_and_the_agent_continues() {
    let mut s = setup(
        ApprovalMode::Ask,
        &[],
        vec![
            call("t1", RUN_SHELL, json!({"command": "touch ran"})),
            reply("ok, skipped"),
        ],
    );
    s.agent.send_message("s1", "run").unwrap();

    let request = until_request(&mut s.rx).await;
    assert!(matches!(
        request,
        SessionEvent::ApprovalRequested { kind: ApprovalKind::Command, ref command, .. }
            if command.as_deref() == Some("touch ran")
    ));
    assert!(s.agent.answer_approval("s1", "t1", ApprovalDecision::Deny));
    let events = until_end(&mut s.rx).await;

    assert!(!s.root.join("ran").exists());
    let (is_error, output) = &results(&events)[0];
    assert!(is_error);
    assert!(output.contains("denied"), "{output}");
    assert!(matches!(
        events.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Completed,
            ..
        })
    ));
    // The model is told and gets to continue.
    let sent = serde_json::to_string(&s.model.requests.lock().unwrap()[1].messages).unwrap();
    assert!(sent.contains("denied"));
}

#[tokio::test]
async fn always_allow_approves_that_exact_command_for_the_session() {
    let mut s = setup(
        ApprovalMode::Ask,
        &[],
        vec![
            call("t1", RUN_SHELL, json!({"command": "echo hi"})),
            call("t2", RUN_SHELL, json!({"command": "echo hi"})),
            call("t3", RUN_SHELL, json!({"command": "echo other"})),
            reply("done"),
        ],
    );
    s.agent.send_message("s1", "run").unwrap();

    until_request(&mut s.rx).await;
    s.agent
        .answer_approval("s1", "t1", ApprovalDecision::AlwaysAllow);
    // The repeat runs at once; a different command asks again.
    let request = until_request(&mut s.rx).await;
    assert!(matches!(
        request,
        SessionEvent::ApprovalRequested { ref call_id, .. } if call_id == "t3"
    ));
    s.agent
        .answer_approval("s1", "t3", ApprovalDecision::Approve);
    let events = until_end(&mut s.rx).await;
    assert!(results(&events).iter().all(|(e, _)| !e));
}

#[tokio::test]
async fn auto_edit_applies_edits_but_asks_for_commands() {
    let mut s = setup(
        ApprovalMode::AutoEdit,
        &[("a.txt", "old")],
        vec![
            call(
                "t1",
                EDIT_FILE,
                json!({"path": "a.txt", "old_string": "old", "new_string": "new"}),
            ),
            call("t2", RUN_SHELL, json!({"command": "true"})),
            reply("done"),
        ],
    );
    s.agent.send_message("s1", "go").unwrap();

    let request = until_request(&mut s.rx).await;
    assert!(matches!(
        request,
        SessionEvent::ApprovalRequested { ref call_id, kind: ApprovalKind::Command, .. } if call_id == "t2"
    ));
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "new"
    );
    s.agent
        .answer_approval("s1", "t2", ApprovalDecision::Approve);
    until_end(&mut s.rx).await;
}

#[tokio::test]
async fn full_auto_never_asks() {
    let mut s = setup(
        ApprovalMode::FullAuto,
        &[("a.txt", "old")],
        vec![
            call(
                "t1",
                EDIT_FILE,
                json!({"path": "a.txt", "old_string": "old", "new_string": "new"}),
            ),
            call("t2", RUN_SHELL, json!({"command": "echo ran > out.txt"})),
            reply("done"),
        ],
    );
    s.agent.send_message("s1", "go").unwrap();
    let events = until_end(&mut s.rx).await;

    assert!(!asked(&events));
    assert!(matches!(
        events.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Completed,
            ..
        })
    ));
    assert_eq!(
        std::fs::read_to_string(s.root.join("a.txt")).unwrap(),
        "new"
    );
    assert_eq!(
        std::fs::read_to_string(s.root.join("out.txt")).unwrap(),
        "ran\n"
    );
}

#[tokio::test]
async fn reading_never_needs_approval() {
    let mut s = setup(
        ApprovalMode::Ask,
        &[("a.txt", "x")],
        vec![
            call("t1", READ_FILE, json!({"path": "a.txt"})),
            reply("done"),
        ],
    );
    s.agent.send_message("s1", "read").unwrap();
    assert!(!asked(&until_end(&mut s.rx).await));
}

#[tokio::test]
async fn a_mode_change_applies_to_the_next_action() {
    let mut s = setup(
        ApprovalMode::Ask,
        &[],
        vec![
            call("t1", RUN_SHELL, json!({"command": "true"})),
            call("t2", RUN_SHELL, json!({"command": "true"})),
            reply("done"),
        ],
    );
    s.agent.send_message("s1", "go").unwrap();
    until_request(&mut s.rx).await;
    s.agent.set_approval_mode("s1", ApprovalMode::FullAuto);
    s.agent
        .answer_approval("s1", "t1", ApprovalDecision::Approve);

    let events = until_end(&mut s.rx).await;
    assert!(!asked(&events), "t2 runs without asking in Full-auto");
}

#[tokio::test]
async fn stopping_the_turn_while_a_card_waits_ends_it() {
    let mut s = setup(
        ApprovalMode::Ask,
        &[],
        vec![
            call("t1", RUN_SHELL, json!({"command": "touch ran"})),
            reply("unused"),
        ],
    );
    s.agent.send_message("s1", "run").unwrap();
    until_request(&mut s.rx).await;

    assert!(s.agent.interrupt("s1"));
    let events = until_end(&mut s.rx).await;

    assert!(matches!(
        events.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Interrupted,
            ..
        })
    ));
    assert!(events.iter().any(|e| matches!(
        e,
        SessionEvent::ApprovalResolved {
            decision: ApprovalDecision::Deny,
            ..
        }
    )));
    assert!(!s.root.join("ran").exists());
    assert!(!s
        .agent
        .answer_approval("s1", "t1", ApprovalDecision::Approve));
}

#[test]
fn answering_an_unknown_approval_does_nothing() {
    let agent = Agent::new(Arc::new(FakeModel::default()), EventService::new());
    agent.open_session("s1", ToolBox::new(std::env::temp_dir()));
    assert!(!agent.answer_approval("s1", "nope", ApprovalDecision::Approve));
    assert!(!agent.answer_approval("zz", "nope", ApprovalDecision::Approve));
}
