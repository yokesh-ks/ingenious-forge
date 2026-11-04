//! Git operations for the session's git actions (PRD §6.2 Git actions).
//! They run the `git` command-line tool in the project folder, so they see
//! exactly what the user's own git sees.

use std::{path::Path, process::Command};

pub use api_types::{CommitResult, GitStatus};

/// Runs `git args…` in `dir` and returns its stdout, or its stderr as the
/// error.
fn git(dir: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("cannot run git: {e}"))?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// The current branch (or short commit when detached) and how many files
/// have staged and unstaged changes, new files counting as unstaged.
pub fn status(dir: &Path) -> Result<GitStatus, String> {
    let out = git(dir, &["status", "--porcelain=v2", "--branch", "-z"])?;
    let mut head = None;
    let mut oid = None;
    let (mut staged, mut changed) = (0, 0);
    let mut records = out.split(|b| *b == 0).filter(|r| !r.is_empty());
    while let Some(record) = records.next() {
        let line = String::from_utf8_lossy(record);
        if let Some(name) = line.strip_prefix("# branch.head ") {
            head = Some(name.to_string());
        } else if let Some(sha) = line.strip_prefix("# branch.oid ") {
            oid = Some(sha.to_string());
        } else if line.starts_with("? ") {
            changed += 1;
        } else if line.starts_with("1 ") || line.starts_with("2 ") || line.starts_with("u ") {
            let xy = line.get(2..4).unwrap_or("..");
            let (x, y) = (&xy[..1], &xy[1..]);
            if line.starts_with("u ") {
                changed += 1;
            } else {
                if x != "." {
                    staged += 1;
                }
                if y != "." {
                    changed += 1;
                }
            }
            // A rename or copy is followed by its original path.
            if line.starts_with("2 ") {
                records.next();
            }
        }
    }
    let detached = head.as_deref() == Some("(detached)");
    let branch = if detached {
        oid.map(|sha| sha.chars().take(7).collect())
    } else {
        head
    };
    Ok(GitStatus {
        branch,
        detached,
        staged,
        changed,
    })
}

/// Creates branch `name` from the current commit and checks it out.
pub fn create_branch(dir: &Path, name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || git(dir, &["check-ref-format", "--branch", name]).is_err() {
        return Err(format!("{name:?} is not a valid branch name"));
    }
    let exists = git(
        dir,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{name}"),
        ],
    );
    if exists.is_ok() {
        return Err(format!("a branch named {name} already exists"));
    }
    git(dir, &["switch", "-c", name]).map(|_| ())
}

/// Stages every change, new files included, and commits it with `message`.
pub fn commit(dir: &Path, message: &str) -> Result<CommitResult, String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("write a commit message first".into());
    }
    git(dir, &["add", "--all"])?;
    if git(dir, &["diff", "--cached", "--quiet"]).is_ok() && has_head(dir) {
        return Err("nothing to commit: the working tree has no changes".into());
    }
    commit_from_stdin(dir, message)?;
    let sha = String::from_utf8_lossy(&git(dir, &["rev-parse", "--short", "HEAD"])?)
        .trim()
        .to_string();
    Ok(CommitResult {
        sha,
        summary: message.lines().next().unwrap_or_default().to_string(),
    })
}

/// `git commit` reading the message from stdin, so any text is safe.
fn commit_from_stdin(dir: &Path, message: &str) -> Result<Vec<u8>, String> {
    use std::io::Write;
    let mut child = Command::new("git")
        .args(["commit", "--quiet", "--file", "-"])
        .current_dir(dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot run git: {e}"))?;
    child
        .stdin
        .take()
        .ok_or("cannot write the commit message")?
        .write_all(message.as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        let mut err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if err.is_empty() {
            err = String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
        Err(err)
    }
}

fn has_head(dir: &Path) -> bool {
    git(dir, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok()
}

/// The uncommitted changes as the model reads them to write a message:
/// the changed files, then the diff, cut to about `limit` bytes.
pub fn describe_changes(dir: &Path, limit: usize) -> Result<String, String> {
    let files =
        String::from_utf8_lossy(&git(dir, &["status", "--short", "--untracked-files=all"])?)
            .into_owned();
    let diff = if has_head(dir) {
        git(dir, &["diff", "HEAD"])?
    } else {
        git(dir, &["diff"])?
    };
    let mut diff = String::from_utf8_lossy(&diff).into_owned();
    let budget = limit.saturating_sub(files.len());
    if diff.len() > budget {
        let mut end = budget;
        while !diff.is_char_boundary(end) {
            end -= 1;
        }
        diff.truncate(end);
        diff.push_str("\n[diff cut: it is longer than shown]");
    }
    Ok(format!("Changed files:\n{files}\nDiff:\n{diff}"))
}
