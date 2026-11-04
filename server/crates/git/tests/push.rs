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

#[test]
fn a_github_token_is_offered_to_git_as_a_credential_for_github_only() {
    let dir = temp("cred");
    run(&dir, &["init", "-q"]);
    let fill = |host: &str| {
        let mut child = Command::new("git")
            .args(["credential", "fill"])
            .current_dir(&dir)
            .envs(git::token_env("ghp_secret123"))
            .env("GIT_TERMINAL_PROMPT", "0")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        use std::io::Write;
        child
            .stdin
            .take()
            .unwrap()
            .write_all(format!("protocol=https\nhost={host}\n\n").as_bytes())
            .unwrap();
        String::from_utf8_lossy(&child.wait_with_output().unwrap().stdout).into_owned()
    };

    let github = fill("github.com");
    assert!(github.contains("username=x-access-token"), "{github}");
    assert!(github.contains("password=ghp_secret123"), "{github}");
    assert!(!fill("gitlab.com").contains("ghp_secret123"));
}

#[test]
fn the_token_never_appears_in_git_arguments() {
    for (key, value) in git::token_env("ghp_secret123") {
        if key != "FORGE_GITHUB_TOKEN" {
            assert!(!value.contains("ghp_secret123"), "{key}={value}");
        }
    }
}

#[test]
fn a_push_with_a_token_hands_git_the_credential_helper() {
    use std::os::unix::fs::PermissionsExt;
    let (_, local) = setup();
    // A pre-push hook runs inside the push and sees its environment.
    let hook = local.join(".git/hooks/pre-push");
    fs::write(
        &hook,
        "#!/bin/sh\necho \"$FORGE_GITHUB_TOKEN|$GIT_CONFIG_KEY_1\" > seen\n",
    )
    .unwrap();
    fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(local.join("e.txt"), "e").unwrap();
    run(&local, &["add", "."]);
    run(&local, &["commit", "-q", "-m", "more"]);

    git::push_with(&local, Some("ghp_tok")).unwrap();

    let seen = fs::read_to_string(local.join("seen")).unwrap();
    assert_eq!(seen.trim(), "ghp_tok|credential.https://github.com.helper");
}
