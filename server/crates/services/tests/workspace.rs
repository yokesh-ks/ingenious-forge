//! The workspace panel's file list (PRD §6.2 Workspace panel).

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};

use api_types::EntryKind;
use services::workspace;

fn folder(files: &[&str]) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-workspace-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    for file in files {
        let path = dir.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "x").unwrap();
    }
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn git(dir: &Path, args: &[&str]) {
    let ok = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap()
        .status
        .success();
    assert!(ok, "git {args:?}");
}

#[test]
fn a_repository_lists_tracked_and_new_files_but_not_ignored_ones() {
    let dir = folder(&["src/main.rs", "README.md", "target/out.bin", "notes.txt"]);
    fs::write(dir.join(".gitignore"), "target/\n").unwrap();
    git(&dir, &["init", "-q"]);
    git(&dir, &["add", "src/main.rs", ".gitignore"]);

    let list = workspace::list_files(&dir, 100);

    assert_eq!(
        list.files,
        [".gitignore", "README.md", "notes.txt", "src/main.rs"]
    );
    assert!(!list.truncated);
}

#[test]
fn a_deleted_tracked_file_is_not_listed() {
    let dir = folder(&["a.txt", "b.txt"]);
    git(&dir, &["init", "-q"]);
    git(&dir, &["add", "."]);
    fs::remove_file(dir.join("a.txt")).unwrap();

    assert_eq!(workspace::list_files(&dir, 100).files, ["b.txt"]);
}

#[test]
fn a_folder_that_is_not_a_repository_is_walked_without_dependency_folders() {
    let dir = folder(&[
        "src/lib.rs",
        "node_modules/x/index.js",
        ".git/config",
        "a.txt",
    ]);
    assert_eq!(
        workspace::list_files(&dir, 100).files,
        ["a.txt", "src/lib.rs"]
    );
}

#[test]
fn a_long_list_is_cut_and_says_so() {
    let dir = folder(&["a", "b", "c", "d"]);
    let list = workspace::list_files(&dir, 3);
    assert_eq!(list.files, ["a", "b", "c"]);
    assert!(list.truncated);
}

#[test]
fn a_folder_lists_its_direct_entries_with_their_kinds() {
    let dir = folder(&[".hidden", "a.txt", "sub/inner.txt"]);

    let listing = workspace::list_directory(&dir, 10).unwrap();
    let seen: Vec<_> = listing
        .entries
        .iter()
        .map(|e| (e.name.as_str(), e.kind))
        .collect();
    assert_eq!(
        seen,
        [
            (".hidden", EntryKind::File),
            ("a.txt", EntryKind::File),
            ("sub", EntryKind::Directory),
        ]
    );
    assert!(!listing.truncated);
}

#[test]
fn a_folder_with_too_many_entries_says_it_was_cut() {
    let dir = folder(&["a", "b", "c"]);
    let listing = workspace::list_directory(&dir, 2).unwrap();
    assert_eq!(listing.entries.len(), 2);
    assert!(listing.truncated);
}

#[test]
fn a_missing_folder_or_a_file_is_an_error() {
    let dir = folder(&["a.txt"]);
    let missing = workspace::list_directory(&dir.join("nope"), 2).unwrap_err();
    assert_eq!(missing.kind(), std::io::ErrorKind::NotFound);
    let file = workspace::list_directory(&dir.join("a.txt"), 2).unwrap_err();
    assert_eq!(file.kind(), std::io::ErrorKind::NotADirectory);
}
