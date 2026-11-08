use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use agent::tools::{
    html_to_text, ToolBox, ToolOutcome, BASH, EDIT, GLOB, GREP, READ, WEB_FETCH, WRITE,
};
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

fn ok(output: &str) -> (String, bool) {
    (output.into(), false)
}

/// The text and error flag of an outcome, for comparison.
fn text(outcome: &ToolOutcome) -> (String, bool) {
    (outcome.output.clone(), outcome.is_error)
}

#[test]
fn specs_describe_the_file_tools_and_the_shell() {
    let project = Project::new();
    let names: Vec<_> = project.tools().specs().iter().map(|s| s.name).collect();
    assert_eq!(names, [READ, WRITE, EDIT, GLOB, GREP, WEB_FETCH, BASH]);
    for spec in project.tools().specs() {
        assert_eq!(spec.input_schema["type"], "object");
        assert!(!spec.description.is_empty());
    }
    let specs = project.tools().specs();
    let read = specs.iter().find(|s| s.name == READ).unwrap();
    assert_eq!(read.input_schema["required"], json!(["file_path"]));
    let bash = specs.iter().find(|s| s.name == BASH).unwrap();
    assert!(bash.input_schema["properties"]["description"].is_object());
}

#[test]
fn read_returns_numbered_lines_in_an_envelope_with_meta() {
    let project = Project::new();
    project.write("src/main.rs", "fn main() {\n}\n");
    let out = project
        .tools()
        .run(READ, &json!({ "file_path": "src/main.rs" }));
    let shown = project.path().join("src/main.rs").display().to_string();

    assert!(!out.is_error);
    assert_eq!(
        out.output,
        format!("<path>{shown}</path>\n<type>file</type>\n<content>\n1: fn main() {{\n2: }}\n</content>")
    );
    assert_eq!(
        out.meta,
        Some(json!({
            "path": shown,
            "offset": 1,
            "lines": [
                { "number": 1, "text": "fn main() {" },
                { "number": 2, "text": "}" }
            ],
            "total_lines": 2
        }))
    );
}

#[test]
fn read_takes_an_absolute_path_inside_the_project() {
    let project = Project::new();
    project.write("a.txt", "x\n");
    let absolute = project.path().join("a.txt").display().to_string();
    let out = project.tools().run(READ, &json!({ "file_path": absolute }));
    assert!(!out.is_error, "{}", out.output);
}

#[test]
fn read_pages_with_offset_and_limit_and_says_where_it_stopped() {
    let project = Project::new();
    let body: String = (1..=10).map(|i| format!("line {i}\n")).collect();
    project.write("a.txt", &body);
    let out = project.tools().run(
        READ,
        &json!({ "file_path": "a.txt", "offset": 4, "limit": 3.0 }),
    );

    assert!(!out.is_error, "{}", out.output);
    assert!(out
        .output
        .contains("<content>\n4: line 4\n5: line 5\n6: line 6\n</content>"));
    assert!(
        out.output
            .ends_with("[Showing lines 4-6 of 10; pass offset 7 to read on.]"),
        "{}",
        out.output
    );
    let meta = out.meta.unwrap();
    assert_eq!(
        (meta["offset"].clone(), meta["total_lines"].clone()),
        (json!(4), json!(10))
    );
    assert_eq!(meta["lines"].as_array().unwrap().len(), 3);
}

#[test]
fn read_refuses_an_offset_past_the_end_and_bad_numbers() {
    let project = Project::new();
    project.write("a.txt", "one\n");
    let tools = project.tools();
    let past = tools.run(READ, &json!({ "file_path": "a.txt", "offset": 5 }));
    assert!(past.is_error);
    assert!(past.output.contains("past the end"), "{}", past.output);
    assert!(
        tools
            .run(READ, &json!({ "file_path": "a.txt", "limit": -1 }))
            .is_error
    );
    assert!(
        tools
            .run(READ, &json!({ "file_path": "a.txt", "offset": "2" }))
            .is_error
    );
    // An empty file reads as no lines.
    project.write("empty.txt", "");
    let empty = tools.run(READ, &json!({ "file_path": "empty.txt" }));
    assert!(!empty.is_error, "{}", empty.output);
    assert_eq!(empty.meta.unwrap()["total_lines"], 0);
}

#[test]
fn read_stops_before_a_huge_page_and_says_so() {
    let project = Project::new();
    let line = "x".repeat(1_000);
    let body: String = (0..400).map(|_| format!("{line}\n")).collect();
    project.write("big.txt", &body);
    let out = project
        .tools()
        .run(READ, &json!({ "file_path": "big.txt" }));
    assert!(!out.is_error);
    assert!(out.output.len() < 210_000);
    assert!(
        out.output.contains("of 400; pass offset"),
        "{}",
        &out.output[out.output.len() - 80..]
    );
}

#[test]
fn read_reports_missing_files() {
    let project = Project::new();
    let out = project
        .tools()
        .run(READ, &json!({ "file_path": "nope.txt" }));
    assert!(out.is_error);
    assert!(out.meta.is_none());
    assert!(out.output.contains("nope.txt"), "{}", out.output);
}

#[test]
fn read_refuses_binary_files() {
    let project = Project::new();
    fs::write(project.path().join("img.bin"), [0u8, 159, 146, 150]).unwrap();
    let out = project
        .tools()
        .run(READ, &json!({ "file_path": "img.bin" }));
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
        let out = project.tools().run(READ, &json!({ "file_path": path }));
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
        .run(READ, &json!({ "file_path": "link/secret.txt" }));
    assert!(out.is_error);
    assert!(out.output.contains("outside the project"), "{}", out.output);
}

#[test]
fn edit_replaces_a_unique_match_and_summarises() {
    let project = Project::new();
    project.write("a.txt", "one\ntwo\nthree\n");
    let out = project.tools().run(
        EDIT,
        &json!({ "file_path": "a.txt", "old_string": "two\n", "new_string": "2\n2b\n" }),
    );
    assert_eq!(
        text(&out),
        ok("Edited a.txt: replaced 1 occurrence (+2 −1 lines)")
    );
    assert_eq!(project.read("a.txt"), "one\n2\n2b\nthree\n");
    let meta = out.meta.unwrap();
    assert_eq!(
        (
            meta["created"].clone(),
            meta["additions"].clone(),
            meta["deletions"].clone()
        ),
        (json!(false), json!(2), json!(1))
    );
}

#[test]
fn edit_refuses_ambiguous_matches_unless_replace_all() {
    let project = Project::new();
    project.write("a.txt", "x x x");
    let tools = project.tools();

    let out = tools.run(
        EDIT,
        &json!({ "file_path": "a.txt", "old_string": "x", "new_string": "y" }),
    );
    assert!(out.is_error);
    assert!(out.output.contains("3 times"), "{}", out.output);
    assert_eq!(project.read("a.txt"), "x x x");

    let out = tools.run(
        EDIT,
        &json!({ "file_path": "a.txt", "old_string": "x", "new_string": "y", "replace_all": true }),
    );
    assert_eq!(
        text(&out),
        ok("Edited a.txt: replaced 3 occurrences (+1 −1 lines)")
    );
    assert_eq!(project.read("a.txt"), "y y y");
}

#[test]
fn edit_reports_text_not_found() {
    let project = Project::new();
    project.write("a.txt", "hello");
    let out = project.tools().run(
        EDIT,
        &json!({ "file_path": "a.txt", "old_string": "bye", "new_string": "x" }),
    );
    assert!(out.is_error);
    assert!(out.output.contains("not found"), "{}", out.output);
}

#[test]
fn edit_with_an_empty_old_string_points_to_write() {
    let project = Project::new();
    project.write("a.txt", "keep");
    let out = project.tools().run(
        EDIT,
        &json!({ "file_path": "a.txt", "old_string": "", "new_string": "lost" }),
    );
    assert!(out.is_error);
    assert!(out.output.contains("use write"), "{}", out.output);
    assert_eq!(project.read("a.txt"), "keep");
}

#[test]
fn write_creates_a_file_and_its_folders() {
    let project = Project::new();
    let out = project.tools().run(
        WRITE,
        &json!({ "file_path": "new/dir/file.txt", "content": "hi\nthere\n" }),
    );
    assert_eq!(text(&out), ok("Created new/dir/file.txt (+2 −0 lines)"));
    assert_eq!(project.read("new/dir/file.txt"), "hi\nthere\n");
    assert_eq!(out.meta.unwrap()["created"], true);
}

#[test]
fn write_replaces_a_whole_file() {
    let project = Project::new();
    project.write("a.txt", "old\nkept\n");
    let out = project.tools().run(
        WRITE,
        &json!({ "file_path": "a.txt", "content": "new\nkept\n" }),
    );
    assert_eq!(text(&out), ok("Wrote a.txt (+1 −1 lines)"));
    assert_eq!(project.read("a.txt"), "new\nkept\n");
}

#[test]
fn a_change_can_be_previewed_without_writing() {
    let project = Project::new();
    project.write("a.txt", "one\n");
    let tools = project.tools();
    assert_eq!(
        tools.preview_change(
            EDIT,
            &json!({ "file_path": "a.txt", "old_string": "one", "new_string": "1" })
        ),
        Ok((Some("one\n".to_string()), "1\n".to_string()))
    );
    assert_eq!(
        tools.preview_change(WRITE, &json!({ "file_path": "b.txt", "content": "b" })),
        Ok((None, "b".to_string()))
    );
    assert_eq!(project.read("a.txt"), "one\n");
    assert!(!project.path().join("b.txt").exists());
    assert_eq!(
        ToolBox::changed_path(WRITE, &json!({ "file_path": "b.txt" })).as_deref(),
        Some("b.txt")
    );
    assert_eq!(
        ToolBox::changed_path(READ, &json!({ "file_path": "b.txt" })),
        None
    );
}

/// Sets a file's modification time to `secs` after the epoch.
fn touch(project: &Project, rel: &str, secs: u64) {
    let file = fs::File::options()
        .write(true)
        .open(project.path().join(rel))
        .unwrap();
    file.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(secs))
        .unwrap();
}

#[test]
fn glob_finds_files_at_any_depth_newest_first_including_hidden_and_ignored() {
    let project = Project::new();
    project
        .write("a.ts", "")
        .write("src/b.ts", "")
        .write(".hidden/c.ts", "")
        .write("dist/d.ts", "")
        .write(".gitignore", "dist/\n")
        .write("src/e.rs", "")
        .write(".git/f.ts", "");
    touch(&project, "a.ts", 100);
    touch(&project, "src/b.ts", 300);
    touch(&project, ".hidden/c.ts", 200);
    touch(&project, "dist/d.ts", 400);

    let out = project.tools().run(GLOB, &json!({ "pattern": "*.ts" }));

    assert_eq!(text(&out), ok("dist/d.ts\nsrc/b.ts\n.hidden/c.ts\na.ts"));
    let meta = out.meta.unwrap();
    assert_eq!(
        (meta["matches"].clone(), meta["truncated"].clone()),
        (json!(4), json!(false))
    );
}

#[test]
fn glob_with_a_separator_anchors_the_depth_and_takes_a_path() {
    let project = Project::new();
    project
        .write("src/a.ts", "")
        .write("src/deep/b.ts", "")
        .write("web/c.ts", "");
    let tools = project.tools();
    assert_eq!(
        text(&tools.run(GLOB, &json!({ "pattern": "src/*.ts" }))),
        ok("src/a.ts")
    );
    assert_eq!(
        text(&tools.run(GLOB, &json!({ "pattern": "*.ts", "path": "web" }))),
        ok("web/c.ts")
    );
    assert_eq!(
        text(&tools.run(GLOB, &json!({ "pattern": "*.md" }))),
        ok("No files found.")
    );
    assert!(tools.run(GLOB, &json!({ "pattern": "[" })).is_error);
    assert!(
        tools
            .run(GLOB, &json!({ "pattern": "*", "path": "../" }))
            .is_error
    );
}

#[test]
fn glob_keeps_the_first_hundred_and_says_how_many_more() {
    let project = Project::new();
    for i in 0..105 {
        project.write(&format!("f{i}.txt"), "");
    }
    let out = project.tools().run(GLOB, &json!({ "pattern": "*.txt" }));
    assert_eq!(out.output.lines().count(), 101);
    assert!(out
        .output
        .ends_with("[5 more files not shown; narrow the pattern or path]"));
    assert_eq!(out.meta.unwrap()["truncated"], true);
}

#[test]
fn grep_groups_matching_lines_by_file_like_ripgrep() {
    let project = Project::new();
    project
        .write("a.ts", "const x = 1;\nlet y = 2;\nconst z = 3;\n")
        .write("b.rs", "const X: u8 = 1;\n")
        .write(".hidden/c.ts", "const hidden = 1;\n")
        .write("dist/d.ts", "const ignored = 1;\n")
        .write(".gitignore", "dist/\n");
    fs::write(project.path().join("bin.dat"), b"const\0binary").unwrap();

    let out = project.tools().run(GREP, &json!({ "pattern": "^const" }));
    let mut groups: Vec<&str> = out.output.split("\n\n").collect();
    groups.sort();
    assert_eq!(
        groups,
        [
            "a.ts\n1: const x = 1;\n3: const z = 3;",
            "b.rs\n1: const X: u8 = 1;"
        ]
    );
    let meta = out.meta.unwrap();
    assert_eq!(
        (meta["files"].clone(), meta["matches"].clone()),
        (json!(2), json!(3))
    );
}

#[test]
fn grep_filters_by_include_and_path() {
    let project = Project::new();
    project
        .write("a.ts", "hit\n")
        .write("b.js", "hit\n")
        .write("web/c.ts", "hit\n");
    let tools = project.tools();
    let only_ts = tools.run(GREP, &json!({ "pattern": "hit", "include": "*.ts" }));
    assert!(!only_ts.output.contains("b.js"), "{}", only_ts.output);
    assert!(only_ts.output.contains("web/c.ts"), "{}", only_ts.output);
    let in_web = tools.run(GREP, &json!({ "pattern": "hit", "path": "web" }));
    assert_eq!(text(&in_web), ok("web/c.ts\n1: hit"));
    let one_file = tools.run(GREP, &json!({ "pattern": "hit", "path": "b.js" }));
    assert_eq!(text(&one_file), ok("b.js\n1: hit"));
    assert_eq!(
        text(&tools.run(GREP, &json!({ "pattern": "miss" }))),
        ok("No matches.")
    );
    let bad = tools.run(GREP, &json!({ "pattern": "(" }));
    assert!(bad.is_error);
    assert!(
        bad.output.contains("invalid regular expression"),
        "{}",
        bad.output
    );
}

#[test]
fn grep_stops_at_250_matches_and_says_so() {
    let project = Project::new();
    project.write("a.txt", &"hit\n".repeat(300));
    let out = project.tools().run(GREP, &json!({ "pattern": "hit" }));
    assert!(out
        .output
        .ends_with("[Stopped at 250 matches; narrow the pattern, path or include]"));
    let meta = out.meta.unwrap();
    assert_eq!(
        (meta["matches"].clone(), meta["truncated"].clone()),
        (json!(250), json!(true))
    );
}

#[test]
fn html_turns_into_readable_text() {
    let html = "<html><head><style>p{}</style><script>var x = '<p>';</script></head>\
                <body><h1>Title &amp; more</h1><!-- note --><p>One&nbsp;two</p>\
                <ul><li>a</li><li>b &lt;c&gt;</li></ul><p>Unclosed <b";
    assert_eq!(
        html_to_text(html),
        "Title & more\n\nOne two\n\na\nb <c>\n\nUnclosed"
    );
    assert_eq!(html_to_text("ünïcode <br> ok"), "ünïcode\nok");
}

#[test]
fn invalid_input_and_unknown_tools_are_errors() {
    let project = Project::new();
    let tools = project.tools();
    assert!(tools.run(READ, &json!({})).is_error);
    assert!(tools.run(READ, &json!({ "file_path": 3 })).is_error);
    assert!(tools.run(EDIT, &json!({ "file_path": "a" })).is_error);
    assert!(tools.run(WRITE, &json!({ "file_path": "a" })).is_error);
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
            .run(READ, &json!({ "file_path": "Cargo.toml" }))
            .is_error
    );
    let out = tools.run(READ, &json!({ "file_path": "../Cargo.toml" }));
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

#[test]
fn restore_writes_or_removes_a_file() {
    let project = Project::new();
    project.write("a.txt", "changed");
    project.write("new/b.txt", "created");
    let tools = project.tools();

    tools.restore("a.txt", Some("original")).unwrap();
    tools.restore("new/b.txt", None).unwrap();
    tools.restore("never-existed.txt", None).unwrap();

    assert_eq!(project.read("a.txt"), "original");
    assert!(!project.path().join("new/b.txt").exists());
    assert!(tools.restore("../x", None).is_err());
}
