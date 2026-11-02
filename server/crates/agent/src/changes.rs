//! Tracks the files the agent changes in a session: the content each had
//! before the agent's first edit, and the unified diff from it (PRD §6.2
//! Changed files and diff review).

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub diff: String,
    pub additions: u32,
    pub deletions: u32,
}

/// Unified diff of `path` from `old` to `new`; `None` means the file did
/// not exist on that side.
pub fn unified_diff(path: &str, old: Option<&str>, new: Option<&str>) -> FileChange {
    let text_diff = similar::TextDiff::from_lines(old.unwrap_or(""), new.unwrap_or(""));
    let (mut additions, mut deletions) = (0, 0);
    for change in text_diff.iter_all_changes() {
        match change.tag() {
            similar::ChangeTag::Insert => additions += 1,
            similar::ChangeTag::Delete => deletions += 1,
            similar::ChangeTag::Equal => {}
        }
    }
    let diff = if additions + deletions == 0 {
        String::new()
    } else {
        let from = old.map_or("/dev/null".to_string(), |_| format!("a/{path}"));
        let to = new.map_or("/dev/null".to_string(), |_| format!("b/{path}"));
        text_diff
            .unified_diff()
            .context_radius(3)
            .header(&from, &to)
            .to_string()
    };
    FileChange {
        path: path.to_string(),
        diff,
        additions,
        deletions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modified_file_has_headers_hunks_and_counts() {
        let change = unified_diff(
            "src/a.rs",
            Some("one\ntwo\nthree\n"),
            Some("one\n2\nthree\nfour\n"),
        );
        assert_eq!(change.path, "src/a.rs");
        assert_eq!((change.additions, change.deletions), (2, 1));
        assert_eq!(
            change.diff,
            "--- a/src/a.rs\n+++ b/src/a.rs\n@@ -1,3 +1,4 @@\n one\n-two\n+2\n three\n+four\n"
        );
    }

    #[test]
    fn created_file_is_all_additions_from_dev_null() {
        let change = unified_diff("new.txt", None, Some("hi\nthere\n"));
        assert_eq!((change.additions, change.deletions), (2, 0));
        assert!(
            change.diff.starts_with("--- /dev/null\n+++ b/new.txt\n"),
            "{}",
            change.diff
        );
    }

    #[test]
    fn deleted_file_is_all_deletions_to_dev_null() {
        let change = unified_diff("gone.txt", Some("bye\n"), None);
        assert_eq!((change.additions, change.deletions), (0, 1));
        assert!(
            change.diff.starts_with("--- a/gone.txt\n+++ /dev/null\n"),
            "{}",
            change.diff
        );
    }

    #[test]
    fn unchanged_file_has_an_empty_diff() {
        let change = unified_diff("a", Some("same\n"), Some("same\n"));
        assert_eq!((change.additions, change.deletions), (0, 0));
        assert_eq!(change.diff, "");
    }

    #[test]
    fn missing_final_newline_is_marked() {
        let change = unified_diff("a", Some("x"), Some("y"));
        assert_eq!((change.additions, change.deletions), (1, 1));
        assert!(
            change.diff.contains("\\ No newline at end of file"),
            "{}",
            change.diff
        );
    }
}
