//! The workspace terminal (PRD §6.2 Workspace panel): one PTY per project
//! that outlives browser connections.

use std::{path::PathBuf, time::Duration};

use services::terminal::{TermEvent, Terminals};
use tokio::sync::broadcast;

fn folder() -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-term-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

/// Reads output until it contains `needle`; returns all of it.
async fn read_until(
    rx: &mut broadcast::Receiver<TermEvent>,
    mut seen: String,
    needle: &str,
) -> String {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    while !seen.contains(needle) {
        let event = tokio::time::timeout_at(deadline, rx.recv())
            .await
            .unwrap_or_else(|_| panic!("no {needle:?} in {seen:?}"))
            .unwrap();
        match event {
            TermEvent::Output(bytes) => seen.push_str(&String::from_utf8_lossy(&bytes)),
            TermEvent::Exit => panic!("the shell exited before {needle:?}: {seen:?}"),
        }
    }
    seen
}

#[tokio::test]
async fn a_command_runs_in_the_project_folder_and_its_output_streams() {
    let dir = folder();
    let terminals = Terminals::with_shell("/bin/sh");
    let attached = terminals.attach("p1", &dir).unwrap();
    let mut rx = attached.events;

    attached
        .terminal
        .write(b"pwd; echo marker-$((40+2))\n")
        .unwrap();

    let out = read_until(&mut rx, String::new(), "marker-42").await;
    assert!(out.contains(dir.to_str().unwrap()), "{out}");
}

#[tokio::test]
async fn reattaching_reuses_the_same_shell_and_replays_recent_output() {
    let dir = folder();
    let terminals = Terminals::with_shell("/bin/sh");
    let first = terminals.attach("p1", &dir).unwrap();
    let mut rx = first.events;
    first.terminal.write(b"echo pid-$$-end\n").unwrap();
    let out = read_until(&mut rx, String::new(), "-end\r\n").await;
    let pid = out
        .rsplit("pid-")
        .next()
        .unwrap()
        .split("-end")
        .next()
        .unwrap()
        .to_string();
    drop(rx);

    let second = terminals.attach("p1", &dir).unwrap();
    let replay = String::from_utf8_lossy(&second.scrollback).into_owned();
    assert!(replay.contains(&format!("pid-{pid}-end")), "{replay}");
    let mut rx = second.events;
    second.terminal.write(b"echo again-$$-done\n").unwrap();
    read_until(&mut rx, String::new(), &format!("again-{pid}-done")).await;
}

#[tokio::test]
async fn each_project_has_its_own_terminal() {
    let terminals = Terminals::with_shell("/bin/sh");
    let a = terminals.attach("a", &folder()).unwrap();
    let b = terminals.attach("b", &folder()).unwrap();
    assert!(!std::sync::Arc::ptr_eq(&a.terminal, &b.terminal));
}

#[tokio::test]
async fn an_exited_shell_is_replaced_on_the_next_attach() {
    let dir = folder();
    let terminals = Terminals::with_shell("/bin/sh");
    let first = terminals.attach("p1", &dir).unwrap();
    let mut rx = first.events;
    first.terminal.write(b"exit\n").unwrap();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match tokio::time::timeout_at(deadline, rx.recv()).await.unwrap() {
            Ok(TermEvent::Exit) => break,
            Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) => {}
            Err(err) => panic!("{err}"),
        }
    }

    let second = terminals.attach("p1", &dir).unwrap();
    assert!(!std::sync::Arc::ptr_eq(&first.terminal, &second.terminal));
    let mut rx = second.events;
    second.terminal.write(b"echo alive\n").unwrap();
    read_until(&mut rx, String::new(), "alive").await;
}

#[tokio::test]
async fn resizing_is_seen_by_programs() {
    let terminals = Terminals::with_shell("/bin/sh");
    let attached = terminals.attach("p1", &folder()).unwrap();
    let mut rx = attached.events;
    attached.terminal.resize(100, 30).unwrap();
    attached.terminal.write(b"stty size\n").unwrap();
    read_until(&mut rx, String::new(), "30 100").await;
}

#[test]
fn a_missing_folder_cannot_be_attached() {
    let terminals = Terminals::with_shell("/bin/sh");
    assert!(terminals
        .attach("p1", std::path::Path::new("/no/such/folder"))
        .is_err());
}
