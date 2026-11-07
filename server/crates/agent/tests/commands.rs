//! Slash commands typed in the composer (PRD §6.1 Project instructions:
//! `/init` generates a first `AGENTS.md`).

use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    commands,
    model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    tools::{ToolBox, EDIT_FILE},
    Agent,
};
use api_types::{SessionEnvelope, SessionEvent};
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
        "forge-commands-{}-{}",
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

fn first_user_text(request: &ModelRequest) -> String {
    request.messages[0]
        .content
        .iter()
        .filter_map(|b| match b {
            ContentBlock::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// ---- survey ----

#[test]
fn survey_detects_languages_build_files_and_key_folders() {
    let root = project(&[
        ("Cargo.toml", "[workspace]"),
        ("server/src/main.rs", "fn main() {}"),
        ("server/src/lib.rs", ""),
        ("web/package.json", "{}"),
        ("web/src/app.tsx", ""),
        ("README.md", "# hi"),
    ]);
    let survey = commands::survey(&ToolBox::new(root));

    assert!(survey.contains("Rust"), "{survey}");
    assert!(survey.contains("TypeScript"), "{survey}");
    assert!(survey.contains("Cargo.toml"), "{survey}");
    assert!(survey.contains("web/package.json"), "{survey}");
    assert!(survey.contains("server/"), "{survey}");
    assert!(survey.contains("web/"), "{survey}");
}

#[test]
fn survey_skips_dependency_and_build_output_folders() {
    let root = project(&[
        ("node_modules/x/index.js", ""),
        ("target/debug/build.rs", ""),
        (".git/config", ""),
        ("main.py", ""),
    ]);
    let survey = commands::survey(&ToolBox::new(root));

    assert!(survey.contains("Python"), "{survey}");
    assert!(!survey.contains("JavaScript"), "{survey}");
    assert!(!survey.contains("Rust"), "{survey}");
    assert!(!survey.contains("node_modules"), "{survey}");
}

#[test]
fn survey_of_an_empty_project_says_so() {
    let survey = commands::survey(&ToolBox::new(project(&[])));
    assert!(survey.contains("no source files"), "{survey}");
}

// ---- expansion ----

#[test]
fn only_known_commands_expand() {
    let tools = ToolBox::new(project(&[]));
    assert!(commands::expand("/init", &tools).is_some());
    assert!(commands::expand("  /init  ", &tools).is_some());
    assert!(commands::expand("/initialise", &tools).is_none());
    assert!(commands::expand("/unknown", &tools).is_none());
    assert!(commands::expand("please /init", &tools).is_none());
}

#[test]
fn init_asks_for_a_new_file_or_an_update_of_the_existing_one() {
    let fresh = commands::expand("/init", &ToolBox::new(project(&[]))).unwrap();
    assert!(fresh.contains("Create AGENTS.md"), "{fresh}");

    let existing =
        commands::expand("/init", &ToolBox::new(project(&[("AGENTS.md", "old")]))).unwrap();
    assert!(existing.contains("already has an AGENTS.md"), "{existing}");
}

#[test]
fn text_after_init_is_passed_on_as_guidance() {
    let prompt = commands::expand(
        "/init focus on the test commands",
        &ToolBox::new(project(&[])),
    )
    .unwrap();
    assert!(prompt.contains("focus on the test commands"), "{prompt}");
}

// ---- in a session ----

#[tokio::test]
async fn init_shows_the_command_but_sends_the_model_the_expanded_prompt() {
    let root = project(&[("go.mod", "module x"), ("main.go", "package main")]);
    let (agent, model, mut rx) = setup(root, vec![vec![ModelEvent::TextDelta("ok".into())]]);

    agent.send_message("s1", "/init").unwrap();
    let events = turn(&mut rx).await;

    assert!(matches!(
        &events[0],
        SessionEvent::UserMessage { text, .. } if text == "/init"
    ));
    let sent = first_user_text(&model.requests.lock().unwrap()[0]);
    assert!(sent.contains("AGENTS.md"), "{sent}");
    assert!(sent.contains("Go"), "{sent}");
    assert!(sent.contains("go.mod"), "{sent}");
}

#[tokio::test]
async fn the_written_agents_md_shows_as_a_changed_file() {
    let root = project(&[("main.py", "")]);
    let (agent, _, mut rx) = setup(
        root.clone(),
        vec![
            vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                id: "t1".into(),
                name: EDIT_FILE.into(),
                input: json!({"path": "AGENTS.md", "old_string": "", "new_string": "# Agents\n"}),
            }])],
            vec![ModelEvent::TextDelta("Wrote AGENTS.md".into())],
        ],
    );

    agent.send_message("s1", "/init").unwrap();
    let events = turn(&mut rx).await;

    assert!(events.iter().any(|e| matches!(
        e,
        SessionEvent::FileChanged { path, additions: 1, .. } if path == "AGENTS.md"
    )));
    assert_eq!(
        std::fs::read_to_string(root.join("AGENTS.md")).unwrap(),
        "# Agents\n"
    );
}

#[tokio::test]
async fn an_ordinary_message_starting_with_a_slash_is_sent_unchanged() {
    let (agent, model, mut rx) =
        setup(project(&[]), vec![vec![ModelEvent::TextDelta("ok".into())]]);

    agent
        .send_message("s1", "/usr/bin is where it lives")
        .unwrap();
    turn(&mut rx).await;

    assert_eq!(
        first_user_text(&model.requests.lock().unwrap()[0]),
        "/usr/bin is where it lives"
    );
}
