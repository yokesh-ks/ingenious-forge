//! The command sandbox (PRD §6.1 Sandbox; ADR 0006): commands may write
//! only inside the writable folders and have no network by default.

use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use agent::{
    model::{ContentBlock, ModelClient, ModelError, ModelEvent, ModelRequest},
    sandbox::{Policy, Sandbox},
    shell,
    tools::{ToolBox, RUN_SHELL},
    Agent,
};
use api_types::SessionEvent;
use serde_json::json;
use services::EventService;
use tokio::sync::{mpsc, watch};

fn folder(name: &str) -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-sandbox-{}-{}-{name}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

async fn run(sandbox: &Sandbox, root: &Path, command: &str) -> shell::ShellOutcome {
    let (_stop, stopped) = watch::channel(false);
    shell::run_in(
        sandbox,
        &Policy::project(root),
        root,
        command,
        |_| {},
        stopped,
    )
    .await
}

// ---- policy and profile (every platform) ----

#[test]
fn the_default_policy_writes_only_to_the_project_without_network() {
    let root = folder("p");
    let policy = Policy::project(&root);
    assert_eq!(policy.writable, vec![root]);
    assert!(!policy.network);
}

#[test]
fn the_macos_profile_allows_writes_only_to_the_writable_folders() {
    let policy = Policy {
        writable: vec![PathBuf::from("/work/my \"app\"")],
        network: false,
    };
    let profile = agent::sandbox::sandbox_exec_profile(&policy);
    assert!(profile.contains("(deny file-write*)"), "{profile}");
    assert!(
        profile.contains(r#"(subpath "/work/my \"app\"")"#),
        "{profile}"
    );
    assert!(profile.contains("(deny network*)"), "{profile}");

    let open = agent::sandbox::sandbox_exec_profile(&Policy {
        network: true,
        ..policy
    });
    assert!(!open.contains("(deny network*)"), "{open}");
}

#[test]
fn an_unavailable_sandbox_refuses_to_build_a_command() {
    let sandbox = Sandbox::Unavailable("install bubblewrap".into());
    let err = sandbox
        .command(&Policy::project(Path::new("/p")), "true")
        .unwrap_err();
    assert!(err.contains("install bubblewrap"), "{err}");
}

#[tokio::test]
async fn an_unavailable_sandbox_runs_nothing() {
    let root = folder("refuse");
    let outcome = run(
        &Sandbox::Unavailable("bwrap is not installed".into()),
        &root,
        "touch ran",
    )
    .await;
    assert!(outcome.is_error);
    assert!(
        outcome.output.contains("bwrap is not installed"),
        "{}",
        outcome.output
    );
    assert!(!root.join("ran").exists());
}

// ---- sandbox-exec on macOS ----

#[cfg(target_os = "macos")]
mod macos {
    use super::*;

    #[test]
    fn macos_detects_sandbox_exec() {
        assert_eq!(Sandbox::detect(), Sandbox::SandboxExec);
        assert_eq!(Sandbox::SandboxExec.name(), "sandbox-exec");
    }

    #[tokio::test]
    async fn a_write_outside_the_project_is_blocked() {
        let root = folder("in");
        let outside = folder("out").join("outside-test");

        let outcome = run(
            &Sandbox::SandboxExec,
            &root,
            &format!("echo x > '{}'", outside.display()),
        )
        .await;

        assert_ne!(outcome.exit_code, Some(0), "{}", outcome.output);
        assert!(
            outcome.output.contains("Operation not permitted"),
            "{}",
            outcome.output
        );
        assert!(!outside.exists());
    }

    #[tokio::test]
    async fn a_write_to_tmp_is_blocked() {
        let root = folder("tmp");
        let target = format!("/tmp/forge-sandbox-test-{}", std::process::id());
        let outcome = run(&Sandbox::SandboxExec, &root, &format!("echo x > {target}")).await;
        assert_ne!(outcome.exit_code, Some(0));
        assert!(!Path::new(&target).exists());
    }

    #[tokio::test]
    async fn writes_inside_the_project_succeed() {
        let root = folder("ok");
        let outcome = run(
            &Sandbox::SandboxExec,
            &root,
            "mkdir -p sub && echo hi > sub/a.txt && cat sub/a.txt",
        )
        .await;
        assert_eq!(outcome.exit_code, Some(0), "{}", outcome.output);
        assert_eq!(
            std::fs::read_to_string(root.join("sub/a.txt")).unwrap(),
            "hi\n"
        );
    }

    #[tokio::test]
    async fn a_symlink_out_of_the_project_does_not_escape() {
        let root = folder("link");
        let outside = folder("target");
        std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
        let outcome = run(&Sandbox::SandboxExec, &root, "echo x > escape/file").await;
        assert_ne!(outcome.exit_code, Some(0));
        assert!(!outside.join("file").exists());
    }

    #[tokio::test]
    async fn network_is_blocked_by_default() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let root = folder("net");
        let command = format!("nc -z -w 2 127.0.0.1 {port}");

        let open = run(&Sandbox::Off, &root, &command).await;
        assert_eq!(open.exit_code, Some(0), "control: {}", open.output);
        let blocked = run(&Sandbox::SandboxExec, &root, &command).await;
        assert_ne!(blocked.exit_code, Some(0), "{}", blocked.output);
    }

    #[tokio::test]
    async fn reading_anywhere_still_works() {
        let root = folder("read");
        let outcome = run(
            &Sandbox::SandboxExec,
            &root,
            "head -c 1 /etc/hosts >/dev/null && echo ok",
        )
        .await;
        assert_eq!(outcome.exit_code, Some(0), "{}", outcome.output);
    }
}

// ---- in a session ----

#[derive(Default)]
struct FakeModel(Mutex<VecDeque<Vec<ModelEvent>>>);

impl ModelClient for FakeModel {
    fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
        let steps = self.0.lock().unwrap().pop_front().unwrap_or_default();
        let (tx, rx) = mpsc::channel(8);
        tokio::spawn(async move {
            for step in steps {
                let _ = tx.send(Ok(step)).await;
            }
        });
        rx
    }
}

async fn shell_result(sandbox: Sandbox, root: &Path, command: &str) -> (bool, Option<i32>, String) {
    let model = FakeModel(Mutex::new(
        vec![
            vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                id: "t1".into(),
                name: RUN_SHELL.into(),
                input: json!({ "command": command }),
            }])],
            vec![ModelEvent::TextDelta("ok".into())],
        ]
        .into(),
    ));
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::new(Arc::new(model), events).with_sandbox(sandbox);
    agent.open_session("s1", ToolBox::new(root));
    agent.send_message("s1", "run").unwrap();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .event;
        if let SessionEvent::ToolResult {
            is_error,
            exit_code,
            output,
            ..
        } = event
        {
            return (is_error, exit_code, output);
        }
    }
}

#[tokio::test]
async fn the_agent_refuses_commands_when_the_sandbox_is_unavailable() {
    let root = folder("agent-refuse");
    let (is_error, exit_code, output) = shell_result(
        Sandbox::Unavailable("install bubblewrap".into()),
        &root,
        "touch ran",
    )
    .await;
    assert!(is_error);
    assert_eq!(exit_code, None);
    assert!(output.contains("install bubblewrap"), "{output}");
    assert!(!root.join("ran").exists());
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn the_agent_runs_commands_inside_sandbox_exec() {
    let root = folder("agent-mac");
    let outside = folder("agent-out").join("x");
    let (_, exit_code, _) = shell_result(
        Sandbox::SandboxExec,
        &root,
        &format!("touch inside && touch '{}'", outside.display()),
    )
    .await;
    assert_ne!(exit_code, Some(0));
    assert!(root.join("inside").exists());
    assert!(!outside.exists());
}
