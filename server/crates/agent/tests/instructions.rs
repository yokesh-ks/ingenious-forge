//! Project instructions (PRD §6.1 Project instructions): the root
//! `AGENTS.md` shapes the system prompt, and nested ones are loaded when
//! the agent works under their folder.

use std::{
    collections::{BTreeSet, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    instructions,
    model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    tools::{ToolBox, LIST_DIRECTORY, READ_FILE},
    Agent,
};
use api_types::{SessionEnvelope, SessionEvent, TurnEndReason};
use serde_json::json;
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
        "forge-instructions-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    for (name, body) in files {
        let path = dir.join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }
    dir
}

fn tool_use(id: &str, name: &str, input: serde_json::Value) -> ModelEvent {
    ModelEvent::Message(vec![ContentBlock::ToolUse {
        id: id.into(),
        name: name.into(),
        input,
    }])
}

fn setup(
    root: PathBuf,
    replies: Vec<Vec<ModelEvent>>,
) -> (Agent, Arc<FakeModel>, broadcast::Receiver<SessionEnvelope>) {
    let model = Arc::new(FakeModel {
        replies: Mutex::new(replies.into()),
        ..FakeModel::default()
    });
    let events = EventService::new();
    let rx = events.subscribe();
    let agent = Agent::new(model.clone(), events);
    agent.open_session("s1", ToolBox::new(root));
    (agent, model, rx)
}

/// The events of one turn, up to and including its end.
async fn turn(rx: &mut broadcast::Receiver<SessionEnvelope>) -> Vec<SessionEvent> {
    let mut out = Vec::new();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timed out waiting for a session event")
            .unwrap()
            .event;
        let end = matches!(event, SessionEvent::TurnEnded { .. });
        out.push(event);
        if end {
            return out;
        }
    }
}

fn tool_outputs(events: &[SessionEvent]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::ToolResult { output, .. } => Some(output.clone()),
            _ => None,
        })
        .collect()
}

// ---- loader ----

#[test]
fn a_project_without_agents_md_has_no_project_instructions() {
    let root = project(&[("README.md", "hi")]);
    assert_eq!(instructions::system_prompt(&ToolBox::new(root)), None);
}

#[test]
fn the_root_agents_md_is_part_of_the_system_prompt() {
    let root = project(&[("AGENTS.md", "Always respond in French.")]);
    let prompt = instructions::system_prompt(&ToolBox::new(root)).unwrap();
    assert!(prompt.contains("Always respond in French."), "{prompt}");
    assert!(prompt.contains("AGENTS.md"), "{prompt}");
}

#[test]
fn a_blank_agents_md_adds_nothing() {
    let root = project(&[("AGENTS.md", "  \n\n")]);
    assert_eq!(instructions::system_prompt(&ToolBox::new(root)), None);
}

#[test]
fn an_agents_md_that_is_not_text_is_skipped() {
    let root = project(&[]);
    std::fs::write(root.join("AGENTS.md"), [0xff, 0xfe, 0x00]).unwrap();
    assert_eq!(instructions::system_prompt(&ToolBox::new(root)), None);
}

#[test]
fn nested_files_between_the_root_and_a_path_load_once_each() {
    let root = project(&[
        ("AGENTS.md", "root rules"),
        ("web/AGENTS.md", "web rules"),
        ("web/src/AGENTS.md", "src rules"),
        ("web/src/app.ts", ""),
        ("other/AGENTS.md", "other rules"),
    ]);
    let tools = ToolBox::new(root);
    let mut loaded = BTreeSet::new();

    let found = instructions::nested(&tools, "web/src/app.ts", false, &mut loaded);
    let paths: Vec<_> = found.iter().map(|(p, _)| p.as_str()).collect();
    assert_eq!(paths, ["web/AGENTS.md", "web/src/AGENTS.md"]);
    assert_eq!(found[1].1, "src rules");

    // Already loaded: nothing new for a sibling file.
    assert!(instructions::nested(&tools, "./web/src/other.ts", false, &mut loaded).is_empty());
}

#[test]
fn a_listed_directory_counts_its_own_agents_md() {
    let root = project(&[("web/AGENTS.md", "web rules")]);
    let tools = ToolBox::new(root);
    let mut loaded = BTreeSet::new();

    assert!(instructions::nested(&tools, ".", true, &mut loaded).is_empty());
    let found = instructions::nested(&tools, "web", true, &mut loaded);
    assert_eq!(
        found,
        vec![("web/AGENTS.md".to_string(), "web rules".to_string())]
    );
}

#[test]
fn a_path_outside_the_project_loads_nothing() {
    let root = project(&[]);
    let mut loaded = BTreeSet::new();
    assert!(instructions::nested(&ToolBox::new(root), "../x/a.txt", false, &mut loaded).is_empty());
}

// ---- in a session ----

#[tokio::test]
async fn the_session_sends_agents_md_as_the_system_prompt() {
    let root = project(&[("AGENTS.md", "Always respond in French.")]);
    let (agent, model, mut rx) = setup(root, vec![vec![ModelEvent::TextDelta("Bonjour".into())]]);

    agent.send_message("s1", "hello").unwrap();
    assert!(matches!(
        turn(&mut rx).await.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Completed,
            ..
        })
    ));

    let requests = model.requests.lock().unwrap();
    let system = requests[0].system.as_deref().expect("a system prompt");
    assert!(system.contains("Always respond in French."));
}

#[tokio::test]
async fn a_session_without_agents_md_starts_normally() {
    let root = project(&[]);
    let (agent, model, mut rx) = setup(root, vec![vec![ModelEvent::TextDelta("hi".into())]]);

    agent.send_message("s1", "hello").unwrap();
    assert!(matches!(
        turn(&mut rx).await.last(),
        Some(SessionEvent::TurnEnded {
            reason: TurnEndReason::Completed,
            ..
        })
    ));
    assert_eq!(model.requests.lock().unwrap()[0].system, None);
}

#[tokio::test]
async fn working_under_a_folder_adds_its_agents_md_to_the_tool_result_once() {
    let root = project(&[
        ("web/AGENTS.md", "Use tabs in web/."),
        ("web/a.ts", "a"),
        ("web/b.ts", "b"),
    ]);
    let (agent, model, mut rx) = setup(
        root,
        vec![
            vec![tool_use("t1", READ_FILE, json!({"path": "web/a.ts"}))],
            vec![tool_use("t2", READ_FILE, json!({"path": "web/b.ts"}))],
            vec![ModelEvent::TextDelta("ok".into())],
        ],
    );

    agent.send_message("s1", "read").unwrap();
    let outputs = tool_outputs(&turn(&mut rx).await);

    assert!(outputs[0].starts_with('a'), "{}", outputs[0]);
    assert!(outputs[0].contains("web/AGENTS.md"), "{}", outputs[0]);
    assert!(outputs[0].contains("Use tabs in web/."), "{}", outputs[0]);
    assert_eq!(outputs[1], "b");

    // The model saw the instructions in the tool result too.
    let requests = model.requests.lock().unwrap();
    let sent = serde_json::to_string(&requests[1].messages).unwrap();
    assert!(sent.contains("Use tabs in web/."));
}

#[tokio::test]
async fn listing_a_folder_loads_its_agents_md() {
    let root = project(&[("web/AGENTS.md", "web rules"), ("web/a.ts", "")]);
    let (agent, _, mut rx) = setup(
        root,
        vec![
            vec![tool_use("t1", LIST_DIRECTORY, json!({"path": "web"}))],
            vec![ModelEvent::TextDelta("ok".into())],
        ],
    );

    agent.send_message("s1", "list").unwrap();
    let outputs = tool_outputs(&turn(&mut rx).await);
    assert!(outputs[0].contains("web rules"), "{}", outputs[0]);
}

#[tokio::test]
async fn a_failed_tool_call_does_not_load_instructions() {
    let root = project(&[("web/AGENTS.md", "web rules")]);
    let (agent, _, mut rx) = setup(
        root,
        vec![
            vec![tool_use("t1", READ_FILE, json!({"path": "web/missing.ts"}))],
            vec![tool_use("t2", READ_FILE, json!({"path": "web/AGENTS.md"}))],
            vec![ModelEvent::TextDelta("ok".into())],
        ],
    );

    agent.send_message("s1", "read").unwrap();
    let outputs = tool_outputs(&turn(&mut rx).await);
    assert!(!outputs[0].contains("web rules"), "{}", outputs[0]);
    // Reading the file itself shows it once, not twice.
    assert_eq!(outputs[1], "web rules");
}

fn prompts(events: &[SessionEvent]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| match e {
            SessionEvent::SystemPrompt { text, .. } => Some(text.clone()),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn the_system_prompt_is_logged_once_until_it_changes() {
    let root = project(&[("AGENTS.md", "Always respond in French.")]);
    let (agent, _, mut rx) = setup(
        root,
        vec![
            vec![ModelEvent::TextDelta("Bonjour".into())],
            vec![ModelEvent::TextDelta("Encore".into())],
        ],
    );

    agent.send_message("s1", "hello").unwrap();
    let first = turn(&mut rx).await;
    agent.send_message("s1", "again").unwrap();
    let second = turn(&mut rx).await;

    let logged = prompts(&first);
    assert_eq!(logged.len(), 1);
    assert!(logged[0].contains("Always respond in French."));
    // It precedes the request it applies to.
    let prompt_at = first
        .iter()
        .position(|e| matches!(e, SessionEvent::SystemPrompt { .. }))
        .unwrap();
    let output_at = first
        .iter()
        .position(|e| matches!(e, SessionEvent::Output { .. }))
        .unwrap();
    assert!(prompt_at < output_at);
    assert!(prompts(&second).is_empty());
}

#[tokio::test]
async fn a_session_without_a_prompt_logs_none() {
    let (agent, _, mut rx) = setup(project(&[]), vec![vec![ModelEvent::TextDelta("hi".into())]]);

    agent.send_message("s1", "hello").unwrap();

    assert!(prompts(&turn(&mut rx).await).is_empty());
}
