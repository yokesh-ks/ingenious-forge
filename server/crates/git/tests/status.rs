//! Branch and working-tree status for the session header (PRD §6.2 Git
//! actions).

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};

fn run(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(["-c", "user.name=Test", "-c", "user.email=test@example.com"])
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

fn repo() -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-git-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap();
    run(&dir, &["init", "-q", "-b", "main"]);
    dir
}

fn commit_file(dir: &Path, name: &str, body: &str) {
    fs::write(dir.join(name), body).unwrap();
    run(dir, &["add", name]);
    run(dir, &["commit", "-q", "-m", "add file"]);
}

#[test]
fn a_clean_repository_shows_its_branch_and_no_changes() {
    let dir = repo();
    commit_file(&dir, "a.txt", "a");

    let status = git::status(&dir).unwrap();

    assert_eq!(status.branch.as_deref(), Some("main"));
    assert!(!status.detached);
    assert_eq!((status.staged, status.changed), (0, 0));
}

#[test]
fn staged_modified_and_new_files_are_counted() {
    let dir = repo();
    commit_file(&dir, "a.txt", "a");
    commit_file(&dir, "b.txt", "b");
    fs::write(dir.join("a.txt"), "changed").unwrap();
    fs::write(dir.join("b.txt"), "staged").unwrap();
    run(&dir, &["add", "b.txt"]);
    fs::write(dir.join("new.txt"), "new").unwrap();
    fs::write(dir.join("both.txt"), "1").unwrap();
    run(&dir, &["add", "both.txt"]);
    fs::write(dir.join("both.txt"), "2").unwrap();

    let status = git::status(&dir).unwrap();

    // b.txt and both.txt are staged; a.txt, both.txt and new.txt have
    // changes not staged.
    assert_eq!(status.staged, 2);
    assert_eq!(status.changed, 3);
}

#[test]
fn a_new_repository_without_commits_has_its_branch() {
    let dir = repo();
    fs::write(dir.join("x"), "x").unwrap();
    let status = git::status(&dir).unwrap();
    assert_eq!(status.branch.as_deref(), Some("main"));
    assert_eq!(status.changed, 1);
}

#[test]
fn a_detached_head_shows_the_short_commit() {
    let dir = repo();
    commit_file(&dir, "a.txt", "a");
    let sha = run(&dir, &["rev-parse", "--short", "HEAD"]);
    run(&dir, &["checkout", "-q", "--detach"]);

    let status = git::status(&dir).unwrap();

    assert!(status.detached);
    assert_eq!(status.branch.as_deref(), Some(sha.as_str()));
}

#[test]
fn a_folder_that_is_not_a_repository_is_an_error() {
    let dir = std::env::temp_dir().join(format!("forge-git-none-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let err = git::status(&dir).unwrap_err();
    assert!(err.contains("not a git repository"), "{err}");
}
