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
use api_types::{MessageSource, SessionEnvelope, SessionEvent, TurnEndReason, Usage};
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

async fn next(rx: &mut broadcast::Receiver<SessionEnvelope>) -> SessionEvent {
    tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("timed out waiting for a session event")
        .unwrap()
        .event
}

/// Collects events for `session_id` until its turn ends (done or error).
async fn turn_events(
    rx: &mut broadcast::Receiver<SessionEnvelope>,
    session_id: &str,
) -> Vec<SessionEvent> {
    let mut out = Vec::new();
    loop {
        let event = next(rx).await;
        if event.session_id() != session_id {
            continue;
        }
        let end = matches!(event, SessionEvent::TurnEnded { .. });
        out.push(event);
        if end {
            return out;
        }
    }
}

/// Short labels for events; user messages are covered by their own test.
fn describe(events: &[SessionEvent]) -> Vec<String> {
    events
        .iter()
        .filter(|e| {
            !matches!(
                e,
                SessionEvent::UserMessage { .. }
                    | SessionEvent::StepStarted { .. }
                    | SessionEvent::StepEnded { .. }
                    | SessionEvent::ReasoningDelta { .. }
                    | SessionEvent::AssistantMessage { .. }
                    | SessionEvent::AssistantAttempt { .. }
                    | SessionEvent::RequestHeader { .. }
                    | SessionEvent::RequestContext { .. }
                    | SessionEvent::SystemPrompt { .. }
                    | SessionEvent::ModelChanged { .. }
                    | SessionEvent::SessionTitle { .. }
                    | SessionEvent::SessionStarted { .. }
            )
        })
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
            SessionEvent::ToolOutput { text, .. } => format!("line:{text}"),
            SessionEvent::ApprovalModeChanged { mode, .. } => format!("mode:{mode:?}"),
            SessionEvent::ApprovalRequested { call_id, .. } => format!("ask:{call_id}"),
            SessionEvent::ApprovalResolved { call_id, .. } => format!("answered:{call_id}"),
            SessionEvent::SandboxChanged { .. } => "sandbox".to_string(),
            SessionEvent::Error { message, .. } => format!("error:{message}"),
            SessionEvent::Done { .. } => "done".to_string(),
            SessionEvent::Interrupted { .. } => "interrupted".to_string(),
            SessionEvent::TurnEnded { reason, .. } => match reason {
                TurnEndReason::Completed => "done".to_string(),
                TurnEndReason::Interrupted => "interrupted".to_string(),
                TurnEndReason::Error { message, .. } => format!("error:{message}"),
            },
            SessionEvent::FileChanged { path, .. } => format!("changed:{path}"),
            SessionEvent::UserMessage { .. }
            | SessionEvent::StepStarted { .. }
            | SessionEvent::StepEnded { .. }
            | SessionEvent::ReasoningDelta { .. }
            | SessionEvent::AssistantMessage { .. }
            | SessionEvent::AssistantAttempt { .. }
            | SessionEvent::RequestHeader { .. }
            | SessionEvent::RequestContext { .. }
            | SessionEvent::SystemPrompt { .. }
            | SessionEvent::ModelChanged { .. }
            | SessionEvent::SessionTitle { .. }
            | SessionEvent::SessionStarted { .. } => unreachable!(),
            SessionEvent::ChangesReverted { paths, .. } => format!("reverted:{paths:?}"),
        })
        .collect()
}

fn setup(model: FakeModel) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEnvelope>) {
    setup_in(model, std::env::temp_dir())
}

fn setup_in(
    model: FakeModel,
    root: std::path::PathBuf,
) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEnvelope>) {
    let model = Arc::new(model);
    let events = EventService::new();
    let rx = events.subscribe();
    let agent = Agent::new(model.clone(), events);
    agent.open_session("s1", ToolBox::new(&root));
    agent.open_session("s2", ToolBox::new(&root));
    (agent, model, rx)
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
async fn a_busy_session_does_not_block_other_sessions() {
    let hold = Arc::new(Semaphore::new(0));
    let model = FakeModel {
        hold: Some(hold.clone()),
        ..FakeModel::replying(vec![vec![text("slow")], vec![text("fast")]])
    };
    let (agent, _, mut rx) = setup(model);

    agent.send_message("s1", "first").unwrap();
    agent.send_message("s2", "other").unwrap();

    hold.add_permits(2);
    turn_events(&mut rx, "s1").await;
}

/// Waits for the next event of `session_id` matching `pred`, returning the
/// events seen on the way.
async fn until(
    rx: &mut broadcast::Receiver<SessionEnvelope>,
    session_id: &str,
    pred: impl Fn(&SessionEvent) -> bool,
) -> Vec<SessionEvent> {
    let mut seen = Vec::new();
    loop {
        let event = next(rx).await;
        if event.session_id() != session_id {
            continue;
        }
        let hit = pred(&event);
        seen.push(event);
        if hit {
            return seen;
        }
    }
}

fn is_output(e: &SessionEvent) -> bool {
    matches!(e, SessionEvent::Output { .. })
}

fn slow(s: &str) -> Step {
    (
        Duration::from_millis(400),
        Ok(ModelEvent::TextDelta(s.into())),
    )
}

#[tokio::test]
async fn a_message_during_a_reply_steers_the_turn_at_its_next_step() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![
        vec![text("Working"), slow(" on it")],
        vec![text("Switching to tests")],
    ]));

    agent.send_message("s1", "build it").unwrap();
    until(&mut rx, "s1", is_output).await;
    agent
        .send_message("s1", "  actually, write tests  ")
        .unwrap();
    let events = describe(&turn_events(&mut rx, "s1").await);

    // One turn: the steer did not start a second one.
    assert_eq!(events.iter().filter(|e| *e == "started").count(), 0);
    assert_eq!(events.last().unwrap(), "done");
    let requests = model.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests[1].messages,
        vec![
            ChatMessage::user_text("build it"),
            ChatMessage::assistant_text("Working on it"),
            ChatMessage::user_text("actually, write tests"),
        ]
    );
}

#[tokio::test]
async fn a_message_during_tool_use_joins_the_tool_results() {
    let root = project(&[]);
    let (agent, model, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![slow("Listing"), {
                let (_, call) = tool_use("t1", "list_directory", json!({}));
                (Duration::from_millis(200), call)
            }],
            vec![text("ok")],
        ]),
        root,
    );

    agent.send_message("s1", "go").unwrap();
    until(&mut rx, "s1", is_output).await;
    agent.send_message("s1", "skip hidden files").unwrap();
    turn_events(&mut rx, "s1").await;

    let requests = model.requests.lock().unwrap();
    let last = requests[1].messages.last().unwrap();
    assert_eq!(
        last.content,
        vec![
            ContentBlock::ToolResult {
                tool_use_id: "t1".into(),
                content: "(empty directory)".into(),
                is_error: false,
            },
            ContentBlock::Text {
                text: "skip hidden files".into()
            },
        ]
    );
}

#[tokio::test]
async fn interrupt_stops_a_streaming_reply_and_frees_the_session() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![
        vec![text("par"), slow("tial")],
        vec![text("next")],
    ]));

    agent.send_message("s1", "go").unwrap();
    until(&mut rx, "s1", is_output).await;
    assert!(agent.interrupt("s1"));
    let events = describe(&turn_events(&mut rx, "s1").await);

    assert_eq!(events, ["interrupted"]);

    // The session accepts a new turn, and the partial reply is kept so the
    // conversation stays in order.
    agent.send_message("s1", "again").unwrap();
    assert_eq!(
        describe(&turn_events(&mut rx, "s1").await).last().unwrap(),
        "done"
    );
    let requests = model.requests.lock().unwrap();
    assert_eq!(
        requests[1].messages,
        vec![
            ChatMessage::user_text("go"),
            ChatMessage::assistant_text("par"),
            ChatMessage::user_text("again"),
        ]
    );
}

#[tokio::test]
async fn interrupt_between_steps_leaves_every_tool_call_answered() {
    let (agent, model, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![tool_use("t1", "list_directory", json!({}))],
            vec![slow("never")],
            vec![text("fresh")],
        ]),
        project(&[]),
    );

    agent.send_message("s1", "go").unwrap();
    until(&mut rx, "s1", |e| {
        matches!(e, SessionEvent::ToolResult { .. })
    })
    .await;
    assert!(agent.interrupt("s1"));
    assert_eq!(
        describe(&turn_events(&mut rx, "s1").await).last().unwrap(),
        "interrupted"
    );

    agent.send_message("s1", "again").unwrap();
    turn_events(&mut rx, "s1").await;
    let requests = model.requests.lock().unwrap();
    let history = &requests.last().unwrap().messages;
    // assistant tool_use is followed by its tool_result, then the new prompt.
    assert!(matches!(
        history[1].content[0],
        ContentBlock::ToolUse { .. }
    ));
    assert!(matches!(
        history[2].content[0],
        ContentBlock::ToolResult { .. }
    ));
    assert_eq!(history.last().unwrap(), &ChatMessage::user_text("again"));
}

#[tokio::test]
async fn interrupt_with_no_running_turn_does_nothing() {
    let (agent, _, mut rx) = setup(FakeModel::default());
    assert!(!agent.interrupt("s1"));
    assert!(tokio::time::timeout(Duration::from_millis(100), rx.recv())
        .await
        .is_err());
}

#[tokio::test]
async fn model_error_ends_the_turn_and_frees_the_session() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![
        vec![
            text("par"),
            (
                Duration::ZERO,
                Err(ModelError::MissingApiKey {
                    provider: "Anthropic".into(),
                }),
            ),
        ],
        vec![text("ok")],
    ]));

    agent.send_message("s1", "hi").unwrap();
    let events = describe(&turn_events(&mut rx, "s1").await);
    assert_eq!(events[..2], ["started", "out:par"]);
    assert!(
        events[2].starts_with("error:Anthropic has no API key"),
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
            SessionEvent::TurnEnded { .. } => break,
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
async fn every_request_offers_the_file_tools_and_the_shell() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![vec![text("hi")]]));
    agent.send_message("s1", "hi").unwrap();
    turn_events(&mut rx, "s1").await;
    let names: Vec<_> = model.requests.lock().unwrap()[0]
        .tools
        .iter()
        .map(|t| t.name)
        .collect();
    assert_eq!(
        names,
        ["read_file", "edit_file", "list_directory", "run_shell"]
    );
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

#[tokio::test]
async fn an_empty_reply_ends_the_turn() {
    let (agent, model, mut rx) = setup(FakeModel::replying(vec![vec![(
        Duration::ZERO,
        Ok(ModelEvent::Message(vec![])),
    )]]));

    agent.send_message("s1", "hi").unwrap();

    assert_eq!(
        describe(&turn_events(&mut rx, "s1").await),
        ["started", "done"]
    );
    assert_eq!(model.requests.lock().unwrap().len(), 1);
}

fn edit(id: &str, path: &str, old: &str, new: &str) -> Step {
    tool_use(
        id,
        "edit_file",
        json!({ "path": path, "old_string": old, "new_string": new }),
    )
}

fn changes(events: &[SessionEvent]) -> Vec<(String, u32, u32, String)> {
    events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::FileChanged {
                path,
                additions,
                deletions,
                diff,
                ..
            } => Some((path.clone(), *additions, *deletions, diff.clone())),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn each_edit_publishes_the_cumulative_diff_of_the_file() {
    let root = project(&[("a.txt", "one\ntwo\n")]);
    let (agent, _, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![edit("e1", "a.txt", "one", "1")],
            vec![edit("e2", "./a.txt", "two", "2")],
            vec![text("done")],
        ]),
        root,
    );

    agent.send_message("s1", "edit").unwrap();
    let events = turn_events(&mut rx, "s1").await;
    let changes = changes(&events);

    assert_eq!(changes.len(), 2);
    assert_eq!(
        (changes[0].0.as_str(), changes[0].1, changes[0].2),
        ("a.txt", 1, 1)
    );
    // The second diff is still against the file as it was before the session.
    assert_eq!(
        (changes[1].0.as_str(), changes[1].1, changes[1].2),
        ("a.txt", 2, 2)
    );
    assert!(
        changes[1].3.contains("-one\n-two\n+1\n+2\n"),
        "{}",
        changes[1].3
    );
    // The change event follows the tool result it belongs to.
    let result_at = events
        .iter()
        .position(|e| matches!(e, SessionEvent::ToolResult { call_id, .. } if call_id == "e1"))
        .unwrap();
    assert!(matches!(
        events[result_at + 1],
        SessionEvent::FileChanged { .. }
    ));
}

#[tokio::test]
async fn a_created_file_is_diffed_against_nothing() {
    let (agent, _, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![edit("e1", "new.txt", "", "hi\n")],
            vec![text("ok")],
        ]),
        project(&[]),
    );

    agent.send_message("s1", "create").unwrap();
    let changes = changes(&turn_events(&mut rx, "s1").await);

    assert_eq!(changes.len(), 1);
    assert_eq!((changes[0].1, changes[0].2), (1, 0));
    assert!(
        changes[0].3.starts_with("--- /dev/null"),
        "{}",
        changes[0].3
    );
}

#[tokio::test]
async fn failed_edits_and_reads_publish_no_change() {
    let (agent, _, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![edit("e1", "a.txt", "missing", "x")],
            vec![tool_use("r1", "read_file", json!({ "path": "a.txt" }))],
            vec![text("ok")],
        ]),
        project(&[("a.txt", "body")]),
    );

    agent.send_message("s1", "try").unwrap();
    assert!(changes(&turn_events(&mut rx, "s1").await).is_empty());
}

#[tokio::test]
async fn changes_are_tracked_per_session() {
    let root = project(&[("a.txt", "v0")]);
    let (agent, _, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![edit("e1", "a.txt", "v0", "v1")],
            vec![text("ok")],
            vec![edit("e2", "a.txt", "v1", "v2")],
            vec![text("ok")],
        ]),
        root,
    );

    agent.send_message("s1", "first").unwrap();
    turn_events(&mut rx, "s1").await;
    agent.send_message("s2", "second").unwrap();
    let changes = changes(&turn_events(&mut rx, "s2").await);

    // s2 started after s1's edit, so its baseline is v1, not v0.
    assert!(changes[0].3.contains("-v1\n"), "{}", changes[0].3);
}

fn reverted(events: &[SessionEvent]) -> Option<Vec<String>> {
    events.iter().find_map(|e| match e {
        SessionEvent::ChangesReverted { paths, .. } => Some(paths.clone()),
        _ => None,
    })
}

async fn next_for(rx: &mut broadcast::Receiver<SessionEnvelope>, session_id: &str) -> SessionEvent {
    loop {
        let event = next(rx).await;
        if event.session_id() == session_id {
            return event;
        }
    }
}

#[tokio::test]
async fn revert_all_restores_edited_files_and_removes_created_ones() {
    let root = project(&[("a.txt", "original")]);
    let (agent, _, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![edit("e1", "a.txt", "original", "changed")],
            vec![edit("e2", "new.txt", "", "created")],
            vec![text("ok")],
        ]),
        root.clone(),
    );
    agent.send_message("s1", "edit").unwrap();
    turn_events(&mut rx, "s1").await;

    agent.revert_all("s1").await.unwrap();

    let event = next_for(&mut rx, "s1").await;
    assert_eq!(
        reverted(&[event]),
        Some(vec!["a.txt".to_string(), "new.txt".to_string()])
    );
    assert_eq!(
        std::fs::read_to_string(root.join("a.txt")).unwrap(),
        "original"
    );
    assert!(!root.join("new.txt").exists());
}

#[tokio::test]
async fn after_revert_the_next_turn_starts_a_fresh_baseline_and_tells_the_model() {
    let root = project(&[("a.txt", "v0")]);
    let (agent, model, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![edit("e1", "a.txt", "v0", "v1")],
            vec![text("ok")],
            vec![text("noted")],
        ]),
        root,
    );
    agent.send_message("s1", "edit").unwrap();
    turn_events(&mut rx, "s1").await;
    agent.revert_all("s1").await.unwrap();
    next_for(&mut rx, "s1").await;

    agent.send_message("s1", "what now?").unwrap();
    turn_events(&mut rx, "s1").await;

    let requests = model.requests.lock().unwrap();
    let last = requests.last().unwrap().messages.last().unwrap();
    assert_eq!(
        last.content,
        vec![
            ContentBlock::Text {
                text:
                    "Note: the user reverted every file change you made in this session (a.txt). \
                       Those files are back to how they were before your edits."
                        .into()
            },
            ContentBlock::Text {
                text: "what now?".into()
            },
        ]
    );
}

#[tokio::test]
async fn revert_all_is_refused_while_a_turn_runs() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![text("a"), slow("b")]]));
    agent.send_message("s1", "go").unwrap();
    until(&mut rx, "s1", is_output).await;

    assert_eq!(agent.revert_all("s1").await, Err(AgentError::TurnRunning));
    turn_events(&mut rx, "s1").await;
}

#[tokio::test]
async fn revert_all_with_no_changes_reports_an_empty_list() {
    let (agent, _, mut rx) = setup(FakeModel::default());
    agent.revert_all("s1").await.unwrap();
    assert_eq!(reverted(&[next_for(&mut rx, "s1").await]), Some(vec![]));
}

#[tokio::test]
async fn sessions_that_were_not_opened_are_refused() {
    let (agent, model, _rx) = setup(FakeModel::default());
    assert_eq!(
        agent.send_message("unknown", "hi"),
        Err(AgentError::UnknownSession)
    );
    assert_eq!(
        agent.revert_all("unknown").await,
        Err(AgentError::UnknownSession)
    );
    assert!(model.requests.lock().unwrap().is_empty());
    assert!(agent.is_open("s1"));
    assert!(!agent.is_open("unknown"));
}

#[tokio::test]
async fn each_session_works_in_its_own_project_folder() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![
        vec![tool_use("l1", "list_directory", json!({}))],
        vec![text("ok")],
        vec![tool_use("l2", "list_directory", json!({}))],
        vec![text("ok")],
    ]));
    agent.open_session("a", ToolBox::new(project(&[("in-a.txt", "")])));
    agent.open_session("b", ToolBox::new(project(&[("in-b.txt", "")])));
    // Opening again keeps the session's folder.
    agent.open_session("a", ToolBox::new(project(&[("other.txt", "")])));

    agent.send_message("a", "list").unwrap();
    let a = describe(&turn_events(&mut rx, "a").await);
    agent.send_message("b", "list").unwrap();
    let b = describe(&turn_events(&mut rx, "b").await);

    assert!(a.contains(&"result:l1:false:in-a.txt".to_string()), "{a:?}");
    assert!(b.contains(&"result:l2:false:in-b.txt".to_string()), "{b:?}");
}

#[tokio::test]
async fn is_running_follows_the_turn() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![text("a"), slow("b")]]));
    assert!(!agent.is_running("s1"));
    agent.send_message("s1", "go").unwrap();
    assert!(agent.is_running("s1"));
    turn_events(&mut rx, "s1").await;
    assert!(!agent.is_running("s1"));
    assert!(!agent.is_running("unknown"));
}

mod restart {
    //! The session log lets a session continue after the server restarts.

    use std::path::PathBuf;

    use services::log::SessionLog;

    use super::*;

    fn log_dir() -> PathBuf {
        project(&[]).join("logs")
    }

    /// An agent whose events go to the session log in `dir`, as after a
    /// fresh server start.
    fn start(
        model: FakeModel,
        dir: &std::path::Path,
        root: &std::path::Path,
    ) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEnvelope>) {
        let model = Arc::new(model);
        let events = EventService::with_log(Arc::new(SessionLog::open(dir).unwrap()));
        let rx = events.subscribe();
        let agent = Agent::new(model.clone(), events);
        agent.open_session("s1", ToolBox::new(root));
        (agent, model, rx)
    }

    #[tokio::test]
    async fn the_conversation_continues_after_a_restart() {
        let (dir, root) = (log_dir(), project(&[]));
        {
            let (agent, _, mut rx) =
                start(FakeModel::replying(vec![vec![text("Hello")]]), &dir, &root);
            agent.send_message("s1", "hi").unwrap();
            turn_events(&mut rx, "s1").await;
        }

        let (agent, model, mut rx) =
            start(FakeModel::replying(vec![vec![text("Again")]]), &dir, &root);
        agent.send_message("s1", "more").unwrap();
        turn_events(&mut rx, "s1").await;

        assert_eq!(
            model.requests.lock().unwrap()[0].messages,
            vec![
                ChatMessage::user_text("hi"),
                ChatMessage::assistant_text("Hello"),
                ChatMessage::user_text("more"),
            ]
        );
    }

    #[tokio::test]
    async fn a_failed_turn_is_not_restored() {
        let (dir, root) = (log_dir(), project(&[]));
        {
            let (agent, _, mut rx) = start(
                FakeModel::replying(vec![vec![(
                    Duration::ZERO,
                    Err(ModelError::MissingApiKey {
                        provider: "Anthropic".into(),
                    }),
                )]]),
                &dir,
                &root,
            );
            agent.send_message("s1", "hi").unwrap();
            turn_events(&mut rx, "s1").await;
        }

        let (agent, model, mut rx) =
            start(FakeModel::replying(vec![vec![text("ok")]]), &dir, &root);
        agent.send_message("s1", "retry").unwrap();
        turn_events(&mut rx, "s1").await;

        assert_eq!(
            model.requests.lock().unwrap()[0].messages,
            vec![ChatMessage::user_text("retry")]
        );
    }

    #[tokio::test]
    async fn revert_all_still_works_after_a_restart() {
        let (dir, root) = (log_dir(), project(&[("a.txt", "original")]));
        {
            let (agent, _, mut rx) = start(
                FakeModel::replying(vec![
                    vec![edit("e1", "a.txt", "original", "changed")],
                    vec![edit("e2", "made.txt", "", "new")],
                    vec![text("ok")],
                ]),
                &dir,
                &root,
            );
            agent.send_message("s1", "edit").unwrap();
            turn_events(&mut rx, "s1").await;
        }

        let (agent, _, _rx) = start(FakeModel::default(), &dir, &root);
        agent.revert_all("s1").await.unwrap();

        assert_eq!(
            std::fs::read_to_string(root.join("a.txt")).unwrap(),
            "original"
        );
        assert!(!root.join("made.txt").exists());
    }

    #[tokio::test]
    async fn baselines_left_after_a_revert_are_what_is_restored() {
        let (dir, root) = (log_dir(), project(&[("a.txt", "v0")]));
        {
            let (agent, _, mut rx) = start(
                FakeModel::replying(vec![
                    vec![edit("e1", "a.txt", "v0", "v1")],
                    vec![text("ok")],
                ]),
                &dir,
                &root,
            );
            agent.send_message("s1", "edit").unwrap();
            turn_events(&mut rx, "s1").await;
            agent.revert_all("s1").await.unwrap();
        }
        std::fs::write(root.join("a.txt"), "user's own edit").unwrap();

        let (agent, _, _rx) = start(FakeModel::default(), &dir, &root);
        agent.revert_all("s1").await.unwrap();

        // Nothing was tracked after the first revert, so the user's edit stays.
        assert_eq!(
            std::fs::read_to_string(root.join("a.txt")).unwrap(),
            "user's own edit"
        );
    }

    #[tokio::test]
    async fn a_turn_cut_off_by_the_restart_is_closed_with_an_error() {
        let (dir, root) = (log_dir(), project(&[]));
        let log = SessionLog::open(&dir).unwrap();
        // A log from before turn numbers.
        log.append_event(&SessionEvent::TurnStarted {
            session_id: "s1".into(),
            turn: 0,
        })
        .unwrap();
        drop(log);

        let (_agent, _, mut rx) = start(FakeModel::default(), &dir, &root);

        let closing = rx.try_recv().unwrap();
        assert_eq!(closing.seq, 2);
        assert!(closing.ts > 0);
        assert!(matches!(
            closing.event,
            SessionEvent::TurnEnded {
                turn: 1,
                reason: TurnEndReason::Error { ref code, ref message },
                ..
            } if code == "SERVER_RESTARTED" && message.contains("server stopped")
        ));

        // Opening again does not add a second error.
        let (_agent, _, mut rx) = start(FakeModel::default(), &dir, &root);
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn a_message_cut_off_before_its_turn_started_is_closed_with_an_error() {
        let (dir, root) = (log_dir(), project(&[]));
        let log = SessionLog::open(&dir).unwrap();
        log.append_event(&SessionEvent::UserMessage {
            session_id: "s1".into(),
            text: "hi".into(),
            source: MessageSource::Human,
        })
        .unwrap();
        drop(log);

        let (_agent, _, mut rx) = start(FakeModel::default(), &dir, &root);

        let closing = rx.try_recv().unwrap();
        assert_eq!(closing.seq, 2);
        assert!(matches!(
            closing.event,
            SessionEvent::TurnEnded {
                turn: 1,
                reason: TurnEndReason::Error { ref code, .. },
                ..
            } if code == "SERVER_RESTARTED"
        ));
    }

    #[tokio::test]
    async fn turn_numbers_continue_after_a_restart() {
        let (dir, root) = (log_dir(), project(&[]));
        let log = SessionLog::open(&dir).unwrap();
        for turn in [1, 2] {
            log.append_event(&SessionEvent::TurnStarted {
                session_id: "s1".into(),
                turn,
            })
            .unwrap();
            log.append_event(&SessionEvent::TurnEnded {
                session_id: "s1".into(),
                turn,
                reason: TurnEndReason::Completed,
            })
            .unwrap();
        }
        drop(log);

        let (agent, _, mut rx) = start(FakeModel::replying(vec![vec![text("ok")]]), &dir, &root);
        agent.send_message("s1", "again").unwrap();
        let events = turn_events(&mut rx, "s1").await;

        assert!(matches!(
            events[1],
            SessionEvent::TurnStarted { turn: 3, .. }
        ));
        assert!(matches!(
            events.last(),
            Some(SessionEvent::TurnEnded { turn: 3, .. })
        ));
    }
}

/// Turn and step boundaries as `(name, turn, step)`.
fn boundaries(events: &[SessionEvent]) -> Vec<(&'static str, u32, u32)> {
    events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::TurnStarted { turn, .. } => Some(("turn", *turn, 0)),
            SessionEvent::StepStarted { turn, step, .. } => Some(("step", *turn, *step)),
            SessionEvent::StepEnded { turn, step, .. } => Some(("/step", *turn, *step)),
            SessionEvent::TurnEnded { turn, .. } => Some(("/turn", *turn, 0)),
            _ => None,
        })
        .collect()
}

fn end_code(events: &[SessionEvent]) -> Option<String> {
    match events.last() {
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Error { code, .. },
            ..
        }) => Some(code.clone()),
        _ => None,
    }
}

#[tokio::test]
async fn turns_and_steps_are_numbered_and_bounded() {
    let (agent, _, mut rx) = setup_in(
        FakeModel::replying(vec![
            vec![tool_use("t1", "list_directory", json!({}))],
            vec![text("done")],
            vec![text("again")],
        ]),
        project(&[]),
    );

    agent.send_message("s1", "go").unwrap();
    let first = turn_events(&mut rx, "s1").await;
    agent.send_message("s1", "more").unwrap();
    let second = turn_events(&mut rx, "s1").await;

    assert_eq!(
        boundaries(&first),
        [
            ("turn", 1, 0),
            ("step", 1, 1),
            ("/step", 1, 1),
            ("step", 1, 2),
            ("/step", 1, 2),
            ("/turn", 1, 0)
        ]
    );
    assert_eq!(
        boundaries(&second),
        [
            ("turn", 2, 0),
            ("step", 2, 1),
            ("/step", 2, 1),
            ("/turn", 2, 0)
        ]
    );
    // A step's tool calls run between its start and end.
    let at = |pred: fn(&SessionEvent) -> bool| first.iter().position(pred).unwrap();
    assert!(
        at(|e| matches!(e, SessionEvent::ToolResult { .. }))
            < at(|e| matches!(e, SessionEvent::StepEnded { step: 1, .. }))
    );
}

#[tokio::test]
async fn a_model_failure_ends_its_step_and_the_turn_with_a_provider_code() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![(
        Duration::ZERO,
        Err(ModelError::Stream("broken".into())),
    )]]));

    agent.send_message("s1", "hi").unwrap();
    let events = turn_events(&mut rx, "s1").await;

    assert_eq!(
        boundaries(&events),
        [
            ("turn", 1, 0),
            ("step", 1, 1),
            ("/step", 1, 1),
            ("/turn", 1, 0)
        ]
    );
    assert_eq!(end_code(&events).as_deref(), Some("PROVIDER_ERROR"));
}

#[tokio::test]
async fn the_step_limit_ends_the_turn_with_its_own_code() {
    let replies = (0..60)
        .map(|i| vec![tool_use(&format!("t{i}"), "list_directory", json!({}))])
        .collect();
    let (agent, _, mut rx) = setup_in(FakeModel::replying(replies), project(&[]));

    agent.send_message("s1", "loop").unwrap();
    let events = turn_events(&mut rx, "s1").await;

    assert_eq!(end_code(&events).as_deref(), Some("MAX_STEPS"));
    let steps = boundaries(&events)
        .iter()
        .filter(|(name, ..)| *name == "/step")
        .count();
    assert_eq!(steps, 50);
}

#[tokio::test]
async fn an_interrupted_turn_ends_its_step_first() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![text("a"), slow("b")]]));

    agent.send_message("s1", "hi").unwrap();
    until(&mut rx, "s1", is_output).await;
    assert!(agent.interrupt("s1"));
    let events = turn_events(&mut rx, "s1").await;

    assert_eq!(boundaries(&events), [("/step", 1, 1), ("/turn", 1, 0)]);
    assert!(matches!(
        events.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Interrupted,
            ..
        })
    ));
}

#[tokio::test]
async fn accepted_messages_are_published_including_steers() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![
        vec![text("a"), slow("b")],
        vec![text("c")],
    ]));

    agent.send_message("s1", "  first  ").unwrap();
    let mut events = until(&mut rx, "s1", is_output).await;
    agent.send_message("s1", "steer").unwrap();
    events.extend(turn_events(&mut rx, "s1").await);

    let users: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::UserMessage { text, source, .. } => Some((text.as_str(), *source)),
            _ => None,
        })
        .collect();
    assert_eq!(
        users,
        [
            ("first", MessageSource::Human),
            ("steer", MessageSource::Steering)
        ]
    );
    assert!(matches!(events[0], SessionEvent::UserMessage { .. }));
    assert!(matches!(events[1], SessionEvent::TurnStarted { .. }));
}

#[tokio::test]
async fn rejected_messages_are_not_published() {
    let (agent, _, mut rx) = setup(FakeModel::default());
    assert!(agent.send_message("s1", "  ").is_err());
    assert!(agent.send_message("ghost", "hi").is_err());
    assert!(rx.try_recv().is_err());
}

fn step_ended(events: &[SessionEvent]) -> Vec<(Option<Usage>, Option<u64>, Option<u64>)> {
    events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::StepEnded {
                usage,
                first_token_ms,
                generation_ms,
                ..
            } => Some((*usage, *first_token_ms, *generation_ms)),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn a_step_records_its_usage_and_first_token_timing() {
    let usage = Usage {
        input: 100,
        output: 20,
        cache_read: 900,
        cache_write: 0,
    };
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![
        (
            Duration::from_millis(60),
            Ok(ModelEvent::TextDelta("Hi".into())),
        ),
        (
            Duration::from_millis(40),
            Ok(ModelEvent::TextDelta(" there".into())),
        ),
        (Duration::ZERO, Ok(ModelEvent::Usage(usage))),
    ]]));

    agent.send_message("s1", "hi").unwrap();
    let events = turn_events(&mut rx, "s1").await;

    let ended = step_ended(&events);
    assert_eq!(ended.len(), 1);
    let (reported, first_token, generation) = ended[0];
    assert_eq!(reported, Some(usage));
    let first_token = first_token.expect("first-token time");
    assert!((50..1000).contains(&first_token), "{first_token}");
    let generation = generation.expect("generation time");
    assert!((30..1000).contains(&generation), "{generation}");
}

#[tokio::test]
async fn a_settled_reply_is_logged_with_its_usage() {
    let usage = Usage {
        input: 5,
        output: 2,
        cache_read: 0,
        cache_write: 0,
    };
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![
        text("Hello"),
        (Duration::ZERO, Ok(ModelEvent::Usage(usage))),
    ]]));

    agent.send_message("s1", "hi").unwrap();
    let events = turn_events(&mut rx, "s1").await;

    let messages: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::AssistantMessage {
                turn,
                step,
                content,
                usage,
                ..
            } => Some((*turn, *step, content.clone(), *usage)),
            _ => None,
        })
        .collect();
    assert_eq!(
        messages,
        [(
            1,
            1,
            vec![json!({ "type": "text", "text": "Hello" })],
            Some(usage)
        )]
    );
}

#[tokio::test]
async fn reasoning_streams_to_the_session_with_its_step() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![
        (
            Duration::ZERO,
            Ok(ModelEvent::ReasoningDelta("Let me ".into())),
        ),
        (
            Duration::ZERO,
            Ok(ModelEvent::ReasoningDelta("think.".into())),
        ),
        text("Done"),
    ]]));

    agent.send_message("s1", "hi").unwrap();
    let events = turn_events(&mut rx, "s1").await;

    let reasoning: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::ReasoningDelta {
                turn, step, chunk, ..
            } => Some((*turn, *step, chunk.as_str())),
            _ => None,
        })
        .collect();
    assert_eq!(reasoning, [(1, 1, "Let me "), (1, 1, "think.")]);
    // Reasoning counts as the first token.
    assert!(step_ended(&events)[0].1.is_some());
}

#[tokio::test]
async fn a_failed_request_is_logged_as_an_attempt_without_usage() {
    let (agent, _, mut rx) = setup(FakeModel::replying(vec![vec![(
        Duration::ZERO,
        Err(ModelError::Stream("broken".into())),
    )]]));

    agent.send_message("s1", "hi").unwrap();
    let events = turn_events(&mut rx, "s1").await;

    assert!(events.iter().any(|e| matches!(
        e,
        SessionEvent::AssistantAttempt { turn: 1, step: 1, error, .. } if error.contains("broken")
    )));
    assert!(!events
        .iter()
        .any(|e| matches!(e, SessionEvent::AssistantMessage { .. })));
    assert_eq!(step_ended(&events), [(None, None, None)]);
}
