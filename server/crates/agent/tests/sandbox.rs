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
use api_types::{SessionEvent, TurnEndReason};
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

// ---- bubblewrap on Linux: arguments and detection (every platform) ----

#[test]
fn bubblewrap_mounts_everything_read_only_except_the_writable_folders() {
    let policy = Policy {
        writable: vec![PathBuf::from("/work/app"), PathBuf::from("/work/cache")],
        network: false,
    };
    let sandbox = Sandbox::Bubblewrap(PathBuf::from("/usr/bin/bwrap"));
    let (program, args) = sandbox.command(&policy, "make test").unwrap();

    assert_eq!(program, PathBuf::from("/usr/bin/bwrap"));
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    assert_eq!(
        args,
        [
            "--ro-bind",
            "/",
            "/",
            "--dev",
            "/dev",
            "--proc",
            "/proc",
            "--bind",
            "/work/app",
            "/work/app",
            "--bind",
            "/work/cache",
            "/work/cache",
            "--unshare-net",
            "--die-with-parent",
            "--",
            "/bin/sh",
            "-c",
            "make test",
        ]
    );
    assert_eq!(sandbox.name(), "bubblewrap");
}

#[test]
fn bubblewrap_keeps_the_network_when_allowed() {
    let policy = Policy {
        writable: vec![PathBuf::from("/w")],
        network: true,
    };
    let (_, args) = Sandbox::Bubblewrap("bwrap".into())
        .command(&policy, "x")
        .unwrap();
    assert!(!args.iter().any(|a| a == "--unshare-net"));
}

#[test]
fn macos_without_sandbox_exec_is_unavailable() {
    let sandbox = agent::sandbox::macos_sandbox(false, || Ok(()));
    let Sandbox::Unavailable(reason) = sandbox else {
        panic!("expected unavailable, got {sandbox:?}")
    };
    assert!(reason.contains("sandbox-exec is missing"), "{reason}");
}

#[test]
fn sandbox_exec_that_cannot_start_a_sandbox_is_unavailable() {
    let sandbox =
        agent::sandbox::macos_sandbox(
            true,
            || Err("sandbox_apply: Operation not permitted".into()),
        );
    let Sandbox::Unavailable(reason) = sandbox else {
        panic!("expected unavailable, got {sandbox:?}")
    };
    assert!(reason.contains("Operation not permitted"), "{reason}");
}

#[test]
fn working_sandbox_exec_is_used() {
    let sandbox = agent::sandbox::macos_sandbox(true, || Ok(()));
    assert_eq!(sandbox, Sandbox::SandboxExec);
}

#[test]
fn linux_without_bubblewrap_is_unavailable_with_install_advice() {
    let sandbox = agent::sandbox::linux_sandbox(None, |_| Ok(()));
    let Sandbox::Unavailable(reason) = sandbox else {
        panic!("expected unavailable, got {sandbox:?}")
    };
    assert!(reason.contains("bubblewrap"), "{reason}");
    assert!(reason.contains("apt install bubblewrap"), "{reason}");
}

#[test]
fn bubblewrap_that_cannot_start_a_sandbox_is_unavailable() {
    let sandbox = agent::sandbox::linux_sandbox(Some("/usr/bin/bwrap".into()), |_| {
        Err("setting up uid map: Permission denied".into())
    });
    let Sandbox::Unavailable(reason) = sandbox else {
        panic!("expected unavailable, got {sandbox:?}")
    };
    assert!(reason.contains("Permission denied"), "{reason}");
    assert!(reason.contains("user namespaces"), "{reason}");
}

#[test]
fn working_bubblewrap_is_used() {
    let sandbox = agent::sandbox::linux_sandbox(Some("/usr/bin/bwrap".into()), |_| Ok(()));
    assert_eq!(sandbox, Sandbox::Bubblewrap("/usr/bin/bwrap".into()));
}

// ---- bubblewrap on Linux: real confinement, when bwrap works here ----

#[cfg(target_os = "linux")]
mod linux {
    use super::*;

    /// The detected sandbox, or `None` (with a note) when bubblewrap
    /// cannot run on this machine, as on CI runners that restrict user
    /// namespaces.
    fn bwrap() -> Option<Sandbox> {
        match Sandbox::detect() {
            sandbox @ Sandbox::Bubblewrap(_) => Some(sandbox),
            other => {
                eprintln!("skipping: bubblewrap is not usable here: {other:?}");
                None
            }
        }
    }

    #[tokio::test]
    async fn a_write_outside_the_project_or_to_tmp_is_blocked() {
        let Some(sandbox) = bwrap() else { return };
        let root = folder("lin-in");
        let outside = folder("lin-out").join("x");
        let tmp = format!("/tmp/forge-sandbox-test-{}", std::process::id());
        for target in [outside.to_string_lossy().into_owned(), tmp.clone()] {
            let outcome = run(&sandbox, &root, &format!("echo x > '{target}'")).await;
            assert_ne!(outcome.exit_code, Some(0), "{}", outcome.output);
            assert!(!Path::new(&target).exists());
        }
    }

    #[tokio::test]
    async fn writes_inside_the_project_succeed() {
        let Some(sandbox) = bwrap() else { return };
        let root = folder("lin-ok");
        let outcome = run(&sandbox, &root, "mkdir -p sub && echo hi > sub/a.txt").await;
        assert_eq!(outcome.exit_code, Some(0), "{}", outcome.output);
        assert_eq!(
            std::fs::read_to_string(root.join("sub/a.txt")).unwrap(),
            "hi\n"
        );
    }

    #[tokio::test]
    async fn outbound_network_is_blocked() {
        let Some(sandbox) = bwrap() else { return };
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let root = folder("lin-net");
        let command = format!(
            "curl -s -m 2 -o /dev/null http://127.0.0.1:{port}/ || nc -z -w 2 127.0.0.1 {port}"
        );
        let open = run(&Sandbox::Off, &root, &command).await;
        if open.exit_code != Some(0) && open.exit_code != Some(52) {
            eprintln!(
                "skipping: neither curl nor nc can reach a local port: {}",
                open.output
            );
            return;
        }
        let blocked = run(&sandbox, &root, &command).await;
        assert_ne!(blocked.exit_code, Some(0), "{}", blocked.output);
        assert_ne!(blocked.exit_code, Some(52), "{}", blocked.output);
    }
}

// ---- what the session header shows ----

#[test]
fn a_session_reports_its_sandbox_and_writable_folders() {
    let root = folder("info");
    let agent = Agent::new(Arc::new(FakeModel::default()), EventService::new())
        .with_sandbox(Sandbox::SandboxExec);
    agent.open_session("s1", ToolBox::new(&root));

    let info = agent.sandbox_info("s1").unwrap();

    assert_eq!(info.name, "sandbox-exec");
    assert!(info.active);
    assert_eq!(info.writable, vec![root.to_string_lossy().into_owned()]);
    assert!(!info.network);
    assert_eq!(info.problem, None);
    assert!(agent.sandbox_info("unknown").is_none());
}

#[test]
fn an_unavailable_sandbox_is_reported_with_its_reason() {
    let agent = Agent::new(Arc::new(FakeModel::default()), EventService::new())
        .with_sandbox(Sandbox::Unavailable("install bubblewrap".into()));
    agent.open_session("s1", ToolBox::new(folder("na")));
    let info = agent.sandbox_info("s1").unwrap();
    assert!(!info.active);
    assert_eq!(info.problem.as_deref(), Some("install bubblewrap"));
}

#[tokio::test]
async fn changing_the_writable_folders_is_announced() {
    let root = folder("change");
    let extra = folder("extra");
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent =
        Agent::new(Arc::new(FakeModel::default()), events).with_sandbox(Sandbox::SandboxExec);
    agent.open_session("s1", ToolBox::new(&root));

    assert!(agent.set_sandbox_policy(
        "s1",
        Policy {
            writable: vec![root.clone(), extra.clone()],
            network: false
        }
    ));

    let event = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .unwrap()
        .unwrap()
        .event;
    let SessionEvent::SandboxChanged { sandbox, .. } = event else {
        panic!("expected sandbox_changed, got {event:?}")
    };
    assert_eq!(sandbox.writable.len(), 2);
    assert_eq!(
        agent.sandbox_info("s1").unwrap().writable[1],
        extra.to_string_lossy()
    );
    assert!(!agent.set_sandbox_policy("unknown", Policy::project(&root)));
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn commands_follow_the_session_policy() {
    let root = folder("policy");
    let extra = folder("policy-extra");
    let model = FakeModel(Mutex::new(
        vec![
            vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                id: "t1".into(),
                name: RUN_SHELL.into(),
                input: json!({ "command": format!("touch '{}/ok'", extra.display()) }),
            }])],
            vec![ModelEvent::TextDelta("done".into())],
        ]
        .into(),
    ));
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::new(Arc::new(model), events).with_sandbox(Sandbox::SandboxExec);
    agent.open_session("s1", ToolBox::new(&root));
    agent.set_sandbox_policy(
        "s1",
        Policy {
            writable: vec![root.clone(), extra.clone()],
            network: false,
        },
    );
    agent.send_message("s1", "go").unwrap();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .event;
        if matches!(
            event,
            SessionEvent::TurnEnded {
                reason: TurnEndReason::Completed,
                ..
            }
        ) {
            break;
        }
    }
    assert!(extra.join("ok").exists());
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn full_auto_runs_without_asking_but_still_inside_the_sandbox() {
    let root = folder("full-auto");
    let outside = folder("full-auto-out").join("x");
    let model = FakeModel(Mutex::new(
        vec![
            vec![ModelEvent::Message(vec![ContentBlock::ToolUse {
                id: "t1".into(),
                name: RUN_SHELL.into(),
                input: json!({ "command": format!("touch inside; touch '{}'", outside.display()) }),
            }])],
            vec![ModelEvent::TextDelta("done".into())],
        ]
        .into(),
    ));
    let events = EventService::new();
    let mut rx = events.subscribe();
    let agent = Agent::new(Arc::new(model), events).with_sandbox(Sandbox::SandboxExec);
    agent.open_session("s1", ToolBox::new(&root));
    agent.set_approval_mode("s1", api_types::ApprovalMode::FullAuto);
    agent.send_message("s1", "go").unwrap();

    let mut asked = false;
    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .event;
        asked |= matches!(event, SessionEvent::ApprovalRequested { .. });
        if matches!(
            event,
            SessionEvent::TurnEnded {
                reason: TurnEndReason::Completed,
                ..
            }
        ) {
            break;
        }
    }
    assert!(!asked);
    assert!(root.join("inside").exists());
    assert!(!outside.exists());
}
