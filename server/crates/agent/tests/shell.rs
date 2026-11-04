//! The Shell tool (PRD §6.1 Built-in tools): runs a command in the project
//! folder and streams its output line by line.

use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    shell::{self, Line},
    tools::{ToolBox, RUN_SHELL},
    Agent,
};
use api_types::{OutputStream, SessionEnvelope, SessionEvent};
use serde_json::json;
use services::EventService;
use tokio::sync::{broadcast, mpsc, watch};

fn project() -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-shell-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

async fn run(root: &std::path::Path, command: &str) -> (shell::ShellOutcome, Vec<Line>) {
    let lines = Arc::new(Mutex::new(Vec::new()));
    let sink = lines.clone();
    let (_stop, stopped) = watch::channel(false);
    let outcome = shell::run(
        root,
        command,
        move |line| sink.lock().unwrap().push(line),
        stopped,
    )
    .await;
    let lines = lines.lock().unwrap().clone();
    (outcome, lines)
}

fn line(stream: OutputStream, text: &str) -> Line {
    Line {
        stream,
        text: text.into(),
    }
}

// ---- running a command ----

#[tokio::test]
async fn stdout_and_stderr_stream_as_lines_and_the_exit_code_is_kept() {
    let root = project();
    let (outcome, lines) = run(&root, "echo hello; echo oops 1>&2; exit 3").await;

    assert_eq!(
        lines,
        [
            line(OutputStream::Stdout, "hello"),
            line(OutputStream::Stderr, "oops")
        ]
    );
    assert_eq!(outcome.exit_code, Some(3));
    assert!(!outcome.is_error);
    assert!(outcome.output.contains("hello"), "{}", outcome.output);
    assert!(outcome.output.contains("oops"), "{}", outcome.output);
    assert!(
        outcome.output.contains("Exit code: 3"),
        "{}",
        outcome.output
    );
}

#[tokio::test]
async fn the_command_runs_in_the_project_folder() {
    let root = project();
    let (outcome, lines) = run(&root, "pwd").await;
    assert_eq!(lines, [line(OutputStream::Stdout, root.to_str().unwrap())]);
    assert_eq!(outcome.exit_code, Some(0));
}

#[tokio::test]
async fn a_last_line_without_a_newline_is_still_shown() {
    let (_, lines) = run(&project(), "printf 'no newline'").await;
    assert_eq!(lines, [line(OutputStream::Stdout, "no newline")]);
}

#[tokio::test]
async fn a_command_with_no_output_says_so() {
    let (outcome, lines) = run(&project(), "true").await;
    assert!(lines.is_empty());
    assert!(outcome.output.contains("(no output)"), "{}", outcome.output);
    assert_eq!(outcome.exit_code, Some(0));
}

#[tokio::test]
async fn lines_arrive_while_the_command_is_still_running() {
    let root = project();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let (_stop, stopped) = watch::channel(false);
    let handle = tokio::spawn(async move {
        shell::run(
            &root,
            "echo first; sleep 1; echo second",
            move |l| {
                let _ = tx.send(l);
            },
            stopped,
        )
        .await
    });

    let first = tokio::time::timeout(Duration::from_millis(700), rx.recv())
        .await
        .expect("the first line should arrive before the command ends")
        .unwrap();
    assert_eq!(first.text, "first");
    assert!(!handle.is_finished());
    assert_eq!(handle.await.unwrap().exit_code, Some(0));
}

#[tokio::test]
async fn long_output_is_cut_for_the_model_but_keeps_its_end() {
    let (outcome, lines) = run(&project(), "seq 1 20000").await;
    assert_eq!(lines.len(), 20000);
    assert!(outcome.output.len() < 40_000, "{}", outcome.output.len());
    assert!(outcome.output.contains("20000"));
    assert!(
        outcome.output.contains("lines not shown"),
        "{}",
        &outcome.output[..200]
    );
}

// ---- in a session ----

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

fn shell_call(command: serde_json::Value) -> Vec<ModelEvent> {
    vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
        id: "t1".into(),
        name: RUN_SHELL.into(),
        input: command,
    }])]
}

async fn turn(rx: &mut broadcast::Receiver<SessionEnvelope>) -> Vec<SessionEvent> {
    let mut out = Vec::new();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("timed out waiting for a session event")
            .unwrap()
            .event;
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

fn setup(
    replies: Vec<Vec<ModelEvent>>,
) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEnvelope>) {
    let model = Arc::new(FakeModel {
        replies: Mutex::new(replies.into()),
        ..FakeModel::default()
    });
    let events = EventService::new();
    let rx = events.subscribe();
    let agent = Agent::new(model.clone(), events);
    agent.open_session("s1", ToolBox::new(project()));
    (agent, model, rx)
}

#[test]
fn the_shell_tool_is_offered_to_the_model() {
    let names: Vec<_> = ToolBox::new(".").specs().iter().map(|s| s.name).collect();
    assert!(names.contains(&RUN_SHELL), "{names:?}");
}

#[tokio::test]
async fn a_shell_call_streams_its_lines_then_returns_the_exit_code() {
    let (agent, model, mut rx) = setup(vec![
        shell_call(json!({"command": "echo hello; echo warn 1>&2"})),
        vec![ModelEvent::TextDelta("ok".into())],
    ]);

    agent.send_message("s1", "run it").unwrap();
    let events = turn(&mut rx).await;

    let streamed: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::ToolOutput {
                call_id,
                stream,
                text,
                ..
            } => Some((call_id.as_str(), *stream, text.as_str())),
            _ => None,
        })
        .collect();
    assert_eq!(
        streamed,
        [
            ("t1", OutputStream::Stdout, "hello"),
            ("t1", OutputStream::Stderr, "warn")
        ]
    );
    let result = events
        .iter()
        .find_map(|e| match e {
            SessionEvent::ToolResult {
                exit_code,
                is_error,
                output,
                ..
            } => Some((*exit_code, *is_error, output.clone())),
            _ => None,
        })
        .unwrap();
    assert_eq!((result.0, result.1), (Some(0), false));

    // The model gets the output and the exit code.
    let requests = model.requests.lock().unwrap();
    let sent = serde_json::to_string(&requests[1].messages).unwrap();
    assert!(
        sent.contains("hello") && sent.contains("Exit code: 0"),
        "{sent}"
    );
}

#[tokio::test]
async fn a_shell_call_without_a_command_is_an_error() {
    let (agent, _, mut rx) = setup(vec![
        shell_call(json!({})),
        vec![ModelEvent::TextDelta("ok".into())],
    ]);

    agent.send_message("s1", "run").unwrap();
    let events = turn(&mut rx).await;

    assert!(events.iter().any(|e| matches!(
        e,
        SessionEvent::ToolResult { is_error: true, exit_code: None, output, .. }
            if output.contains("command")
    )));
}

#[tokio::test]
async fn other_tools_report_no_exit_code() {
    let (agent, _, mut rx) = setup(vec![
        vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
            id: "t1".into(),
            name: "list_directory".into(),
            input: json!({}),
        }])],
        vec![ModelEvent::TextDelta("ok".into())],
    ]);
    agent.send_message("s1", "list").unwrap();
    let events = turn(&mut rx).await;
    assert!(events.iter().any(|e| matches!(
        e,
        SessionEvent::ToolResult {
            exit_code: None,
            ..
        }
    )));
}
