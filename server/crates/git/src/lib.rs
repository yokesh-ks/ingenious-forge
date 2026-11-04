//! Git operations for the session's git actions (PRD §6.2 Git actions).
//! They run the `git` command-line tool in the project folder, so they see
//! exactly what the user's own git sees.

use std::{path::Path, process::Command};

pub use api_types::GitStatus;

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
