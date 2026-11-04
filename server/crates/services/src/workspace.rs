//! The project files shown in the workspace panel (PRD §6.2 Workspace
//! panel).

use std::{collections::BTreeSet, fs, path::Path, process::Command};

use api_types::FileList;

/// Folders that hold dependencies or build output, skipped outside git.
const SKIPPED_DIRS: &[&str] = &["node_modules", "target", "dist", "build", "vendor"];

/// The project's files as `/`-separated relative paths, sorted, at most
/// `limit` of them. In a git repository these are the tracked files and
/// new files that are not ignored; elsewhere the folder is walked.
pub fn list_files(root: &Path, limit: usize) -> FileList {
    let mut files = git_files(root).unwrap_or_else(|| walk(root));
    let truncated = files.len() > limit;
    files.truncate(limit);
    FileList { files, truncated }
}

fn git_files(root: &Path) -> Option<Vec<String>> {
    let out = Command::new("git")
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .current_dir(root)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let files: BTreeSet<String> = out
        .stdout
        .split(|b| *b == 0)
        .filter(|p| !p.is_empty())
        .map(|p| String::from_utf8_lossy(p).into_owned())
        // A tracked file deleted from disk is not there to open.
        .filter(|p| root.join(p).is_file())
        .collect();
    Some(files.into_iter().collect())
}

fn walk(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![(root.to_path_buf(), String::new())];
    while let Some((dir, prefix)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name().to_string_lossy().into_owned();
            let rel = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                if name != ".git" && !SKIPPED_DIRS.contains(&name.as_str()) {
                    stack.push((entry.path(), rel));
                }
            } else if kind.is_file() {
                out.push(rel);
            }
        }
    }
    out.sort();
    out
}
