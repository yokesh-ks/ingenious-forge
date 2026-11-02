use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use agent::{
    model::{ChatMessage, ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    tools::ToolBox,
    Agent, AgentError,
};
use api_types::SessionEvent;
use serde_json::json;
use services::EventService;
use tokio::sync::{broadcast, mpsc, Semaphore};

type Step = (Duration, Result<ModelEvent, ModelError>);

/// Replays one scripted reply per call and records every request.
#[derive(Default)]
struct FakeModel {
    replies: Mutex<VecDeque<Vec<Step>>>,
    requests: Mutex<Vec<ModelRequest>>,
    hold: Option<Arc<Semaphore>>,
    emitted_at: Arc<Mutex<Vec<Instant>>>,
}

impl FakeModel {
    fn replying(replies: Vec<Vec<Step>>) -> Self {
        Self {
            replies: Mutex::new(replies.into()),
            ..Self::default()
        }
    }
}

impl ModelClient for FakeModel {
    fn stream(&self, request: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        self.requests.lock().unwrap().push(request);
        let steps = self.replies.lock().unwrap().pop_front().unwrap_or_default();
        let hold = self.hold.clone();
        let emitted_at = self.emitted_at.clone();
        let (tx, rx) = mpsc::channel(16);
        tokio::spawn(async move {
            if let Some(hold) = hold {
                hold.acquire().await.unwrap().forget();
            }
            for (delay, item) in steps {
                tokio::time::sleep(delay).await;
                emitted_at.lock().unwrap().push(Instant::now());
                if tx.send(item).await.is_err() {
                    return;
                }
            }
        });
        rx
    }
}

fn text(s: &str) -> Step {
    (Duration::ZERO, Ok(ModelEvent::TextDelta(s.into())))
}

async fn next(rx: &mut broadcast::Receiver<SessionEvent>) -> SessionEvent {
    tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("timed out waiting for a session event")
        .unwrap()
}

/// Collects events for `session_id` until its turn ends (done or error).
async fn turn_events(
    rx: &mut broadcast::Receiver<SessionEvent>,
    session_id: &str,
) -> Vec<SessionEvent> {
    let mut out = Vec::new();
    loop {
        let event = next(rx).await;
        if event.session_id() != session_id {
            continue;
        }
        let end = matches!(
            event,
            SessionEvent::Done { .. } | SessionEvent::Error { .. }
        );
        out.push(event);
        if end {
            return out;
        }
    }
}

fn describe(events: &[SessionEvent]) -> Vec<String> {
    events
        .iter()
        .map(|e| match e {
            SessionEvent::TurnStarted { .. } => "started".to_string(),
            SessionEvent::Output { chunk, .. } => format!("out:{chunk}"),
            SessionEvent::ToolCall { name, args, .. } => format!("tool:{name}:{args}"),
            SessionEvent::ToolResult {
                call_id,
                output,
                is_error,
                ..
            } => format!("result:{call_id}:{is_error}:{output}"),
            SessionEvent::Error { message, .. } => format!("error:{message}"),
            SessionEvent::Done { .. } => "done".to_string(),
        })
        .collect()
}

fn setup(model: FakeModel) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEvent>) {
    setup_in(model, std::env::temp_dir())
}

fn setup_in(
    model: FakeModel,
    root: std::path::PathBuf,
) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEvent>) {
    let model = Arc::new(model);
    let events = EventService::new();
    let rx = events.subscribe();
    (
        Agent::new(model.clone(), events, ToolBox::new(root)),
        model,
        rx,
    )
}

/// A fresh project folder holding `files`.
fn project(files: &[(&str, &str)]) -> std::path::PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-turn-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    for (name, body) in files {
        std::fs::write(dir.join(name), body).unwrap();
    }
    dir
}

fn tool_use(id: &str, name: &str, input: serde_json::Value) -> Step {
    (
        Duration::ZERO,
        Ok(ModelEvent::Message(vec![ContentBlock::ToolUse {
            id: id.into(),
            name: name.into(),
            input,
        }])),
    )
}

#[tokio::test]
async fn reply_streams_as_output_events_between_start_and_done() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![text("Hel"), text("lo")]]));

    agent.send_message("s1", "hi").unwrap();

    assert_eq!(
        describe(&turn_events(&mut rx, "s1").await),
        ["started", "out:Hel", "out:lo", "done"]
    );
}

#[tokio::test]
async fn follow_up_turn_sends_the_whole_conversation() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![
        vec![text("Hello")],
        vec![text("Again")],
    ]));

    agent.send_message("s1", "hi").unwrap();
    turn_events(&mut rx, "s1").await;
    agent.send_message("s1", "  more  ").unwrap();
    turn_events(&mut rx, "s1").await;

    let requests = model.requests.lock().unwrap();
    assert_eq!(
        requests[1].messages,
        vec![
            ChatMessage::user_text("hi"),
            ChatMessage::assistant_text("Hello"),
            ChatMessage::user_text("more"),
        ]
    );
}

#[tokio::test]
async fn sessions_keep_separate_conversations() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![vec![text("A")], vec![text("B")]]));

    agent.send_message("s1", "one").unwrap();
    turn_events(&mut rx, "s1").await;
    agent.send_message("s2", "two").unwrap();
    turn_events(&mut rx, "s2").await;

    let requests = model.requests.lock().unwrap();
    assert_eq!(requests[1].messages.len(), 1);
    assert_eq!(requests[1].messages[0], ChatMessage::user_text("two"));
}

#[tokio::test]
async fn empty_message_is_rejected_without_starting_a_turn() {
    let (agent, model, _rx) = setup(FakeModel::default());

    assert_eq!(
        agent.send_message("s1", "   \n"),
        Err(AgentError::EmptyMessage)
    );
    assert!(model.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn second_message_during_a_running_turn_is_rejected() {
    let hold = Arc::new(Semaphore::new(0));
    let model = FakeModel {
        hold: Some(hold.clone()),
        ..FakeModel::replying(vec![vec![text("slow")]])
    };
    let (agent, _, mut rx) = setup(model);

    agent.send_message("s1", "first").unwrap();
    assert_eq!(
        agent.send_message("s1", "second"),
        Err(AgentError::TurnInProgress)
    );
    // Another session is not blocked by s1's turn.
    agent.send_message("s2", "other").unwrap();

    hold.add_permits(2);
    turn_events(&mut rx, "s1").await;
}

#[tokio::test]
async fn model_error_ends_the_turn_and_frees_the_session() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![
        vec![
            text("par"),
            (Duration::ZERO, Err(ModelError::MissingApiKey)),
        ],
        vec![text("ok")],
    ]));

    agent.send_message("s1", "hi").unwrap();
    let events = describe(&turn_events(&mut rx, "s1").await);
    assert_eq!(events[..2], ["started", "out:par"]);
    assert!(
        events[2].starts_with("error:ANTHROPIC_API_KEY is not set"),
        "{events:?}"
    );

    // The failed exchange is not replayed to the model on the next turn.
    agent.send_message("s1", "retry").unwrap();
    turn_events(&mut rx, "s1").await;
    let requests = model.requests.lock().unwrap();
    assert_eq!(requests[1].messages.len(), 1);
    assert_eq!(requests[1].messages[0], ChatMessage::user_text("retry"));
}

#[tokio::test]
async fn output_is_published_within_200ms_of_model_emission() {
    let model = FakeModel::replying(vec![vec![
        (
            Duration::from_millis(50),
            Ok(ModelEvent::TextDelta("a".into())),
        ),
        (
            Duration::from_millis(50),
            Ok(ModelEvent::TextDelta("b".into())),
        ),
    ]]);
    let emitted_at = model.emitted_at.clone();
    let (agent, _, mut rx) = setup(model);

    agent.send_message("s1", "hi").unwrap();
    let mut received_at = Vec::new();
    loop {
        match next(&mut rx).await {
            SessionEvent::Output { .. } => received_at.push(Instant::now()),
            SessionEvent::Done { .. } => break,
            _ => {}
        }
    }

    let emitted_at = emitted_at.lock().unwrap();
    assert_eq!(received_at.len(), 2);
    for (sent, got) in emitted_at.iter().zip(&received_at) {
        assert!(got.duration_since(*sent) < Duration::from_millis(200));
    }
}

#[tokio::test]
async fn tool_calls_run_and_their_results_go_back_to_the_model() {
    let root = project(&[("notes.txt", "remember the milk")]);
    let (agent, model, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![
                text("Let me look. "),
                (
                    Duration::ZERO,
                    Ok(ModelEvent::Message(vec![
                        ContentBlock::Text {
                            text: "Let me look. ".into(),
                        },
                        ContentBlock::ToolUse {
                            id: "t1".into(),
                            name: "read_file".into(),
                            input: json!({ "path": "notes.txt" }),
                        },
                    ])),
                ),
            ],
            vec![text("It says milk.")],
        ]),
        root,
    );

    agent.send_message("s1", "what do my notes say?").unwrap();

    assert_eq!(
        describe(&turn_events(&mut rx, "s1").await),
        [
            "started",
            "out:Let me look. ",
            r#"tool:read_file:{"path":"notes.txt"}"#,
            "result:t1:false:remember the milk",
            "out:It says milk.",
            "done",
        ]
    );
    let requests = model.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests[1].messages[1..],
        [
            ChatMessage::assistant(vec![
                ContentBlock::Text {
                    text: "Let me look. ".into()
                },
                ContentBlock::ToolUse {
                    id: "t1".into(),
                    name: "read_file".into(),
                    input: json!({ "path": "notes.txt" }),
                },
            ]),
            ChatMessage::user(vec![ContentBlock::ToolResult {
                tool_use_id: "t1".into(),
                content: "remember the milk".into(),
                is_error: false,
            }]),
        ]
    );
}

#[tokio::test]
async fn every_request_offers_the_file_tools() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![vec![text("hi")]]));
    agent.send_message("s1", "hi").unwrap();
    turn_events(&mut rx, "s1").await;
    let names: Vec<_> = model.requests.lock().unwrap()[0]
        .tools
        .iter()
        .map(|t| t.name)
        .collect();
    assert_eq!(names, ["read_file", "edit_file", "list_directory"]);
}

#[tokio::test]
async fn edit_and_list_tools_act_on_the_project() {
    let root = project(&[("a.txt", "old")]);
    let (agent, _, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![tool_use(
                "e1",
                "edit_file",
                json!({ "path": "a.txt", "old_string": "old", "new_string": "new" }),
            )],
            vec![tool_use("l1", "list_directory", json!({}))],
            vec![text("ok")],
        ]),
        root.clone(),
    );

    agent.send_message("s1", "edit it").unwrap();
    let events = describe(&turn_events(&mut rx, "s1").await);

    assert!(
        events.contains(
            &"result:e1:false:Edited a.txt: replaced 1 occurrence (+1 −1 lines)".to_string()
        ),
        "{events:?}"
    );
    assert!(
        events.contains(&"result:l1:false:a.txt".to_string()),
        "{events:?}"
    );
    assert_eq!(std::fs::read_to_string(root.join("a.txt")).unwrap(), "new");
}

#[tokio::test]
async fn a_failing_tool_is_reported_to_the_model_and_the_turn_continues() {
    let (agent, model, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![tool_use(
                "t1",
                "read_file",
                json!({ "path": "missing.txt" }),
            )],
            vec![text("Sorry, no file.")],
        ]),
        project(&[]),
    );

    agent.send_message("s1", "read it").unwrap();
    let events = describe(&turn_events(&mut rx, "s1").await);

    assert!(
        events[2].starts_with("result:t1:true:cannot read missing.txt"),
        "{events:?}"
    );
    assert_eq!(events.last().unwrap(), "done");
    let requests = model.requests.lock().unwrap();
    let ContentBlock::ToolResult { is_error, .. } = &requests[1].messages[2].content[0] else {
        panic!("expected a tool result");
    };
    assert!(is_error);
}

#[tokio::test]
async fn a_turn_that_never_stops_calling_tools_is_ended() {
    let replies = (0..60)
        .map(|i| vec![tool_use(&format!("t{i}"), "list_directory", json!({}))])
        .collect();
    let (agent, model, mut rx) = setup_in(FakeModel::replying(replies), project(&[]));

    agent.send_message("s1", "loop").unwrap();
    let events = describe(&turn_events(&mut rx, "s1").await);

    assert!(
        events
            .last()
            .unwrap()
            .starts_with("error:stopped after 50 model steps"),
        "{:?}",
        events.last()
    );
    assert_eq!(model.requests.lock().unwrap().len(), 50);
}
