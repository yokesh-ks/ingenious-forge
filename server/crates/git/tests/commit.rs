//! Creating branches and committing from the browser (PRD §6.2 Git
//! actions).

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};

fn run(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
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

/// A repository with one commit and a committer identity.
fn repo() -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-gitc-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap();
    run(&dir, &["init", "-q", "-b", "main"]);
    run(&dir, &["config", "user.name", "Test"]);
    run(&dir, &["config", "user.email", "test@example.com"]);
    fs::write(dir.join("a.txt"), "one\n").unwrap();
    run(&dir, &["add", "."]);
    run(&dir, &["commit", "-q", "-m", "first"]);
    dir
}

#[test]
fn creating_a_branch_checks_it_out() {
    let dir = repo();
    git::create_branch(&dir, "feat/new-thing").unwrap();
    assert_eq!(run(&dir, &["branch", "--show-current"]), "feat/new-thing");
}

#[test]
fn a_bad_or_taken_branch_name_is_refused() {
    let dir = repo();
    assert!(git::create_branch(&dir, "has space")
        .unwrap_err()
        .contains("not a valid branch name"));
    assert!(git::create_branch(&dir, "  ").is_err());
    assert!(git::create_branch(&dir, "main")
        .unwrap_err()
        .contains("already exists"));
}

#[test]
fn committing_records_every_change_and_returns_the_commit() {
    let dir = repo();
    fs::write(dir.join("a.txt"), "two\n").unwrap();
    fs::write(dir.join("new.txt"), "new\n").unwrap();

    let commit = git::commit(&dir, "feat: change a and add new\n\nBody line.").unwrap();

    assert_eq!(commit.summary, "feat: change a and add new");
    assert_eq!(commit.sha, run(&dir, &["rev-parse", "--short", "HEAD"]));
    assert_eq!(
        run(&dir, &["log", "-1", "--format=%B"]),
        "feat: change a and add new\n\nBody line."
    );
    assert_eq!(run(&dir, &["status", "--porcelain"]), "");
}

#[test]
fn committing_with_nothing_changed_or_no_message_is_refused() {
    let dir = repo();
    assert!(git::commit(&dir, "msg")
        .unwrap_err()
        .contains("nothing to commit"));
    fs::write(dir.join("a.txt"), "x").unwrap();
    assert!(git::commit(&dir, "  \n ").unwrap_err().contains("message"));
}

#[test]
fn the_changes_for_a_message_name_files_and_show_the_diff() {
    let dir = repo();
    fs::write(dir.join("a.txt"), "two\n").unwrap();
    fs::write(dir.join("new.txt"), "new\n").unwrap();

    let changes = git::describe_changes(&dir, 10_000).unwrap();

    assert!(
        changes.contains("a.txt") && changes.contains("new.txt"),
        "{changes}"
    );
    assert!(
        changes.contains("-one") && changes.contains("+two"),
        "{changes}"
    );
}

#[test]
fn a_long_diff_is_cut_for_the_model() {
    let dir = repo();
    fs::write(dir.join("a.txt"), "line\n".repeat(5_000)).unwrap();
    let changes = git::describe_changes(&dir, 2_000).unwrap();
    assert!(changes.len() < 2_500, "{}", changes.len());
    assert!(changes.contains("[diff cut"), "{changes}");
}
