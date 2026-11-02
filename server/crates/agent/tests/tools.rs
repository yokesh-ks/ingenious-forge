use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use agent::tools::{ToolBox, ToolOutcome, EDIT_FILE, LIST_DIRECTORY, READ_FILE};
use serde_json::json;

/// A fresh project folder under the system temp dir, removed on drop.
struct Project(PathBuf);

impl Project {
    fn new() -> Self {
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "forge-tools-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn write(&self, rel: &str, contents: &str) -> &Self {
        let path = self.0.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
        self
    }

    fn read(&self, rel: &str) -> String {
        fs::read_to_string(self.0.join(rel)).unwrap()
    }

    fn tools(&self) -> ToolBox {
        ToolBox::new(&self.0)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Project {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn ok(output: &str) -> ToolOutcome {
    ToolOutcome {
        output: output.into(),
        is_error: false,
    }
}

#[test]
fn specs_describe_the_three_file_tools() {
    let project = Project::new();
    let names: Vec<_> = project.tools().specs().iter().map(|s| s.name).collect();
    assert_eq!(names, [READ_FILE, EDIT_FILE, LIST_DIRECTORY]);
    for spec in project.tools().specs() {
        assert_eq!(spec.input_schema["type"], "object");
        assert!(!spec.description.is_empty());
    }
}

#[test]
fn read_file_returns_contents() {
    let project = Project::new();
    project.write("src/main.rs", "fn main() {}\n");
    assert_eq!(
        project
            .tools()
            .run(READ_FILE, &json!({ "path": "src/main.rs" })),
        ok("fn main() {}\n")
    );
}

#[test]
fn read_file_truncates_large_files_and_says_so() {
    let project = Project::new();
    let big = "x".repeat(300_000);
    project.write("big.txt", &big);
    let out = project
        .tools()
        .run(READ_FILE, &json!({ "path": "big.txt" }));
    assert!(!out.is_error);
    assert!(out.output.len() < 210_000);
    assert!(out
        .output
        .ends_with("[truncated: file is 300000 bytes, showing the first 200000]"));
}

#[test]
fn read_file_reports_missing_files() {
    let project = Project::new();
    let out = project
        .tools()
        .run(READ_FILE, &json!({ "path": "nope.txt" }));
    assert!(out.is_error);
    assert!(out.output.contains("nope.txt"), "{}", out.output);
}

#[test]
fn read_file_refuses_binary_files() {
    let project = Project::new();
    fs::write(project.path().join("img.bin"), [0u8, 159, 146, 150]).unwrap();
    let out = project
        .tools()
        .run(READ_FILE, &json!({ "path": "img.bin" }));
    assert!(out.is_error);
    assert!(
        out.output.contains("not a UTF-8 text file"),
        "{}",
        out.output
    );
}

#[test]
fn paths_outside_the_project_are_refused() {
    let project = Project::new();
    for path in ["../secret", "/etc/hosts", "a/../../b"] {
        let out = project.tools().run(READ_FILE, &json!({ "path": path }));
        assert!(out.is_error, "{path}");
        assert!(out.output.contains("outside the project"), "{}", out.output);
    }
}

#[cfg(unix)]
#[test]
fn symlinks_cannot_escape_the_project() {
    let project = Project::new();
    let outside = Project::new();
    outside.write("secret.txt", "s3cret");
    std::os::unix::fs::symlink(outside.path(), project.path().join("link")).unwrap();
    let out = project
        .tools()
        .run(READ_FILE, &json!({ "path": "link/secret.txt" }));
    assert!(out.is_error);
    assert!(out.output.contains("outside the project"), "{}", out.output);
}

#[test]
fn edit_file_replaces_a_unique_match_and_summarises() {
    let project = Project::new();
    project.write("a.txt", "one\ntwo\nthree\n");
    let out = project.tools().run(
        EDIT_FILE,
        &json!({ "path": "a.txt", "old_string": "two\n", "new_string": "2\n2b\n" }),
    );
    assert_eq!(out, ok("Edited a.txt: replaced 1 occurrence (+2 −1 lines)"));
    assert_eq!(project.read("a.txt"), "one\n2\n2b\nthree\n");
}

#[test]
fn edit_file_refuses_ambiguous_matches_unless_replace_all() {
    let project = Project::new();
    project.write("a.txt", "x x x");
    let tools = project.tools();

    let out = tools.run(
        EDIT_FILE,
        &json!({ "path": "a.txt", "old_string": "x", "new_string": "y" }),
    );
    assert!(out.is_error);
    assert!(out.output.contains("3 times"), "{}", out.output);
    assert_eq!(project.read("a.txt"), "x x x");

    let out = tools.run(
        EDIT_FILE,
        &json!({ "path": "a.txt", "old_string": "x", "new_string": "y", "replace_all": true }),
    );
    assert_eq!(
        out,
        ok("Edited a.txt: replaced 3 occurrences (+1 −1 lines)")
    );
    assert_eq!(project.read("a.txt"), "y y y");
}

#[test]
fn edit_file_reports_text_not_found() {
    let project = Project::new();
    project.write("a.txt", "hello");
    let out = project.tools().run(
        EDIT_FILE,
        &json!({ "path": "a.txt", "old_string": "bye", "new_string": "x" }),
    );
    assert!(out.is_error);
    assert!(out.output.contains("not found"), "{}", out.output);
}

#[test]
fn edit_file_with_empty_old_string_creates_a_new_file() {
    let project = Project::new();
    let out = project.tools().run(
        EDIT_FILE,
        &json!({ "path": "new/dir/file.txt", "old_string": "", "new_string": "hi\nthere\n" }),
    );
    assert_eq!(out, ok("Created new/dir/file.txt (+2 lines)"));
    assert_eq!(project.read("new/dir/file.txt"), "hi\nthere\n");
}

#[test]
fn edit_file_will_not_overwrite_an_existing_file_with_empty_old_string() {
    let project = Project::new();
    project.write("a.txt", "keep");
    let out = project.tools().run(
        EDIT_FILE,
        &json!({ "path": "a.txt", "old_string": "", "new_string": "lost" }),
    );
    assert!(out.is_error);
    assert_eq!(project.read("a.txt"), "keep");
}

#[test]
fn list_directory_lists_sorted_entries_with_dirs_marked() {
    let project = Project::new();
    project
        .write("b.txt", "")
        .write("a.txt", "")
        .write("src/lib.rs", "");
    fs::create_dir_all(project.path().join(".git")).unwrap();
    assert_eq!(
        project.tools().run(LIST_DIRECTORY, &json!({})),
        ok("a.txt\nb.txt\nsrc/")
    );
    assert_eq!(
        project
            .tools()
            .run(LIST_DIRECTORY, &json!({ "path": "src" })),
        ok("lib.rs")
    );
}

#[test]
fn list_directory_reports_an_empty_directory() {
    let project = Project::new();
    assert_eq!(
        project.tools().run(LIST_DIRECTORY, &json!({ "path": "." })),
        ok("(empty directory)")
    );
}

#[test]
fn invalid_input_and_unknown_tools_are_errors() {
    let project = Project::new();
    let tools = project.tools();
    assert!(tools.run(READ_FILE, &json!({})).is_error);
    assert!(tools.run(READ_FILE, &json!({ "path": 3 })).is_error);
    assert!(tools.run(EDIT_FILE, &json!({ "path": "a" })).is_error);
    let out = tools.run("shell", &json!({}));
    assert!(out.is_error);
    assert!(out.output.contains("unknown tool"), "{}", out.output);
}

#[test]
fn a_relative_project_root_still_confines_paths() {
    // Tests run from the crate folder, which holds Cargo.toml.
    let tools = ToolBox::new(".");
    assert!(
        !tools
            .run(READ_FILE, &json!({ "path": "Cargo.toml" }))
            .is_error
    );
    let out = tools.run(READ_FILE, &json!({ "path": "../Cargo.toml" }));
    assert!(out.is_error);
    assert!(out.output.contains("outside the project"), "{}", out.output);
}

#[test]
fn project_paths_are_normalised_relative_to_the_root() {
    let project = Project::new();
    let tools = project.tools();
    assert_eq!(
        tools.project_path("./src/../a.txt"),
        Ok("a.txt".to_string())
    );
    assert_eq!(tools.project_path("dir/b.txt"), Ok("dir/b.txt".to_string()));
    assert!(tools.project_path("../x").is_err());
}

#[test]
fn read_text_distinguishes_missing_files() {
    let project = Project::new();
    project.write("a.txt", "hi");
    let tools = project.tools();
    assert_eq!(tools.read_text("a.txt"), Ok(Some("hi".to_string())));
    assert_eq!(tools.read_text("missing.txt"), Ok(None));
    assert!(tools.read_text("../x").is_err());
}
