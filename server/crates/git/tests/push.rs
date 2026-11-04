//! Pushing the current branch from the browser (PRD §6.2 Git actions).

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};

fn run(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(["-c", "user.name=T", "-c", "user.email=t@example.com"])
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn temp(name: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-push-{}-{}-{name}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// A bare remote and a clone of it with one pushed commit on `main`.
fn setup() -> (PathBuf, PathBuf) {
    let remote = temp("remote");
    run(&remote, &["init", "-q", "--bare", "-b", "main"]);
    let local = temp("local");
    run(&local, &["init", "-q", "-b", "main"]);
    run(
        &local,
        &["remote", "add", "origin", remote.to_str().unwrap()],
    );
    fs::write(local.join("a.txt"), "a").unwrap();
    run(&local, &["add", "."]);
    run(&local, &["commit", "-q", "-m", "first"]);
    run(&local, &["push", "-q", "origin", "main"]);
    (remote, local)
}

#[test]
fn pushing_a_new_branch_sends_it_to_origin() {
    let (remote, local) = setup();
    run(&local, &["switch", "-q", "-c", "feat/x"]);
    fs::write(local.join("b.txt"), "b").unwrap();
    run(&local, &["add", "."]);
    run(&local, &["commit", "-q", "-m", "second"]);

    let pushed = git::push(&local).unwrap();

    assert_eq!(pushed.branch, "feat/x");
    assert_eq!(pushed.remote, "origin");
    assert_eq!(pushed.url, remote.to_str().unwrap());
    assert_eq!(
        run(&remote, &["rev-parse", "feat/x"]),
        run(&local, &["rev-parse", "HEAD"])
    );
    // The branch now tracks its remote.
    assert_eq!(
        run(&local, &["rev-parse", "--abbrev-ref", "@{upstream}"]),
        "origin/feat/x"
    );
}

#[test]
fn a_rejected_push_reports_why() {
    let (remote, local) = setup();
    // Someone else pushes to main first.
    let other = temp("other");
    run(&other, &["clone", "-q", remote.to_str().unwrap(), "."]);
    fs::write(other.join("c.txt"), "c").unwrap();
    run(&other, &["add", "."]);
    run(&other, &["commit", "-q", "-m", "theirs"]);
    run(&other, &["push", "-q", "origin", "main"]);
    fs::write(local.join("d.txt"), "d").unwrap();
    run(&local, &["add", "."]);
    run(&local, &["commit", "-q", "-m", "mine"]);

    let err = git::push(&local).unwrap_err();
    assert!(err.contains("rejected"), "{err}");
}

#[test]
fn a_repository_without_a_remote_cannot_push() {
    let dir = temp("alone");
    run(&dir, &["init", "-q", "-b", "main"]);
    fs::write(dir.join("a"), "a").unwrap();
    run(&dir, &["add", "."]);
    run(&dir, &["commit", "-q", "-m", "x"]);
    assert!(git::push(&dir).unwrap_err().contains("no remote"));
}

#[test]
fn a_detached_head_cannot_push() {
    let (_, local) = setup();
    run(&local, &["checkout", "-q", "--detach"]);
    assert!(git::push(&local).unwrap_err().contains("not on a branch"));
}
