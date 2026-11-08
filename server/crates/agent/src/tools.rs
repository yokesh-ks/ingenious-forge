//! The agent's built-in file tools (PRD §6.1 Built-in tools: `read`,
//! `write`, `edit`, `glob` and `grep`). Every path is resolved inside the
//! project root; a path that escapes it is refused. Each result keeps
//! structured details (`meta`) beside its text for the UI (ADR 0012).
//! Searching uses `ignore`, `globset` and `regex` (ADR 0014).

use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;
use serde_json::{json, Value};

use crate::changes;

pub const READ: &str = "read";
pub const WRITE: &str = "write";
pub const EDIT: &str = "edit";
pub const GLOB: &str = "glob";
pub const GREP: &str = "grep";
/// Runs in the agent rather than here, since it streams (see `shell`).
pub const BASH: &str = "bash";
/// Runs in the agent rather than here, since it needs the network policy.
pub const WEB_FETCH: &str = "web_fetch";
/// Runs in the agent rather than here, since the plan is session state.
pub const TODO_WRITE: &str = "todo_write";
/// Runs in the agent rather than here, since it waits for the user.
pub const ASK_USER_QUESTION: &str = "ask_user_question";

const MAX_READ_BYTES: usize = 200_000;
const DEFAULT_READ_LINES: usize = 2_000;
const MAX_GLOB_FILES: usize = 100;
const MAX_GREP_MATCHES: usize = 250;
/// Longer matching lines are cut, so one minified file cannot fill a result.
const MAX_GREP_LINE: usize = 500;
/// Files larger than this are not searched.
const MAX_GREP_FILE_BYTES: u64 = 5_000_000;

/// A tool definition as sent to the model.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolOutcome {
    pub output: String,
    pub is_error: bool,
    /// Structured details of a successful call, for the UI.
    pub meta: Option<Value>,
}

impl ToolOutcome {
    pub fn error(output: impl Into<String>) -> Self {
        Self {
            output: output.into(),
            is_error: true,
            meta: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ToolBox {
    root: PathBuf,
}

impl ToolBox {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// The project folder the tools work in.
    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn specs(&self) -> Vec<ToolSpec> {
        let path = json!({
            "type": "string",
            "description": "Path of the file, relative to the project root or absolute inside it"
        });
        vec![
            ToolSpec {
                name: READ,
                description: "Read a UTF-8 text file and return line-numbered content.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "file_path": path,
                        "offset": { "type": "number", "description": "1-based first line to return. Defaults to 1." },
                        "limit": { "type": "number", "description": "Maximum number of lines to return. Defaults to 2000." }
                    },
                    "required": ["file_path"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: WRITE,
                description: "Create or fully replace a UTF-8 text file.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "file_path": path,
                        "content": { "type": "string", "description": "The whole new content of the file" }
                    },
                    "required": ["file_path", "content"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: EDIT,
                description: "Edit an existing UTF-8 text file by replacing literal text. old_string must match once unless replace_all is true. Use write to create a file.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "file_path": path,
                        "old_string": { "type": "string", "description": "Exact text to replace" },
                        "new_string": { "type": "string", "description": "Replacement text" },
                        "replace_all": { "type": "boolean", "description": "Replace every occurrence" }
                    },
                    "required": ["file_path", "old_string", "new_string"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: GLOB,
                description: "Find files, not directories, whose paths match a glob pattern, including hidden and ignored files. Returns up to 100 paths, most recently modified first.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the file name at any depth; include a separator to anchor the depth." },
                        "path": { "type": "string", "description": "Directory to search in. Defaults to the project root; a relative path resolves against it." }
                    },
                    "required": ["pattern"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: GREP,
                description: "Search file contents with a regular expression. Returns matching lines with line numbers, grouped by file, skipping ignored, hidden and binary files. Returns up to 250 matches.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Regular expression to search for." },
                        "path": { "type": "string", "description": "File or directory to search. Defaults to the project root; a relative path resolves against it." },
                        "include": { "type": "string", "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\")." }
                    },
                    "required": ["pattern"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: WEB_FETCH,
                description: "Fetch the content of a specific HTTP(S) URL and return it decoded to text. Needs network access in the session's sandbox.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The HTTP(S) URL to fetch." }
                    },
                    "required": ["url"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: BASH,
                description: "Execute a bash command (`bash -c`) in the project root and return its stdout and stderr (the end, for long output) and exit code. Give a short description of what it does.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The command to run" },
                        "description": { "type": "string", "description": "What the command does, in a few words, for the user" }
                    },
                    "required": ["command"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: TODO_WRITE,
                description: "Record and update a task list to plan multi-step work and show progress; skip it for trivial single-step tasks. Add one todo per concrete step before you start. While work remains, keep the todos being worked on `in_progress`, several only when work runs in parallel. Mark each todo `completed` as soon as it is done.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "todos": {
                            "type": "array",
                            "description": "The COMPLETE task list, replacing any previous list.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "content": { "type": "string", "description": "What the task is \u{2014} a short imperative line." },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "in_progress", "completed"],
                                        "description": "pending (not started) | in_progress (now) | completed (done)."
                                    }
                                },
                                "required": ["content", "status"],
                                "additionalProperties": false
                            }
                        }
                    },
                    "required": ["todos"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: ASK_USER_QUESTION,
                description: "Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding. An answer item with empty selected and no custom means the user skipped that question: continue without it, do not ask it again, and do not treat the skip as permission.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "questions": {
                            "type": "array",
                            "description": "Questions to ask the user before continuing.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": { "type": "string", "description": "Stable id for this question; echoed in the answer." },
                                    "question": { "type": "string", "description": "The specific question to ask the user." },
                                    "header": { "type": "string", "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"." },
                                    "options": {
                                        "type": "array",
                                        "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "label": { "type": "string", "description": "Short user-facing option label." },
                                                "description": { "type": "string", "description": "One sentence explaining the tradeoff or impact." }
                                            },
                                            "required": ["label"]
                                        }
                                    },
                                    "multi_select": { "type": "boolean", "description": "Whether the user may select more than one option. Defaults to false." }
                                },
                                "required": ["id", "question"]
                            }
                        }
                    },
                    "required": ["questions"],
                    "additionalProperties": false
                }),
            },
        ]
    }

    pub fn run(&self, name: &str, input: &Value) -> ToolOutcome {
        let result = match name {
            READ => self.read(input),
            WRITE => self.write(input),
            EDIT => self.edit(input),
            GLOB => self.glob(input),
            GREP => self.grep(input),
            other => Err(format!("unknown tool: {other}")),
        };
        match result {
            Ok((output, meta)) => ToolOutcome {
                output,
                is_error: false,
                meta: Some(meta),
            },
            Err(output) => ToolOutcome::error(output),
        }
    }

    /// The plan a `todo_write` call gives: each entry's content trimmed,
    /// non-empty and unique.
    pub fn parse_todos(input: &Value) -> Result<Vec<api_types::TodoItem>, String> {
        let raw = input["todos"]
            .as_array()
            .ok_or("missing array argument: todos")?;
        let mut todos = Vec::with_capacity(raw.len());
        let mut seen = std::collections::BTreeSet::new();
        for item in raw {
            let content = item["content"]
                .as_str()
                .map(str::trim)
                .filter(|c| !c.is_empty())
                .ok_or("invalid todo: `content` must be a non-empty string")?;
            let status = serde_json::from_value(item["status"].clone()).map_err(|_| {
                format!(
                    "invalid todo {content:?}: `status` must be pending, in_progress or completed"
                )
            })?;
            if !seen.insert(content.to_string()) {
                return Err(format!("invalid todos: duplicate content {content:?}"));
            }
            todos.push(api_types::TodoItem {
                content: content.to_string(),
                status,
            });
        }
        Ok(todos)
    }

    /// The questions an `ask_user_question` call asks: at least one, each
    /// with a unique id.
    pub fn parse_questions(input: &Value) -> Result<Vec<api_types::Question>, String> {
        let questions: Vec<api_types::Question> =
            serde_json::from_value(input["questions"].clone())
                .map_err(|err| format!("invalid questions: {err}"))?;
        if questions.is_empty() {
            return Err("invalid questions: ask at least one question".into());
        }
        let mut seen = std::collections::BTreeSet::new();
        for question in &questions {
            if question.id.trim().is_empty() || question.question.trim().is_empty() {
                return Err("invalid question: `id` and `question` must be non-empty".into());
            }
            if !seen.insert(question.id.as_str()) {
                return Err(format!("invalid questions: duplicate id {:?}", question.id));
            }
        }
        Ok(questions)
    }

    /// The file a `write` or `edit` call changes, as given.
    pub fn changed_path(name: &str, input: &Value) -> Option<String> {
        matches!(name, WRITE | EDIT)
            .then(|| input["file_path"].as_str().map(str::to_string))
            .flatten()
    }

    /// `rel` normalised to a `/`-separated path relative to the project
    /// root, so `./a.txt` and `a.txt` name the same file.
    pub fn project_path(&self, rel: &str) -> Result<String, String> {
        let path = self.resolve(rel)?;
        let root = std::path::absolute(&self.root)
            .map(|p| normalize(&p))
            .map_err(|e| format!("project folder is not accessible: {e}"))?;
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| format!("{rel} is outside the project folder"))?;
        Ok(relative
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"))
    }

    /// The text of a project file, or `None` when it does not exist.
    pub fn read_text(&self, rel: &str) -> Result<Option<String>, String> {
        let path = self.resolve(rel)?;
        match fs::read(&path) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| format!("{rel} is not a UTF-8 text file")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("cannot read {rel}: {e}")),
        }
    }

    /// Puts a project file back to `content`, or removes it when `content`
    /// is `None` (the file did not exist before).
    pub fn restore(&self, rel: &str, content: Option<&str>) -> Result<(), String> {
        let path = self.resolve(rel)?;
        match content {
            Some(text) => {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).map_err(|e| format!("cannot restore {rel}: {e}"))?;
                }
                fs::write(&path, text).map_err(|e| format!("cannot restore {rel}: {e}"))
            }
            None => match fs::remove_file(&path) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                    Err(format!("cannot remove {rel}: {e}"))
                }
                _ => Ok(()),
            },
        }
    }

    fn read(&self, input: &Value) -> Result<(String, Value), String> {
        let rel = str_arg(input, "file_path")?;
        let offset = count_arg(input, "offset")?.unwrap_or(1).max(1);
        let limit = count_arg(input, "limit")?
            .unwrap_or(DEFAULT_READ_LINES)
            .max(1);
        let path = self.resolve(rel)?;
        let bytes = fs::read(&path).map_err(|e| format!("cannot read {rel}: {e}"))?;
        let text =
            String::from_utf8(bytes).map_err(|_| format!("{rel} is not a UTF-8 text file"))?;
        let all: Vec<&str> = text.lines().collect();
        let total = all.len();
        if offset > total.max(1) {
            return Err(format!(
                "offset {offset} is past the end of {rel}, which has {total} lines"
            ));
        }
        let mut lines = Vec::new();
        let mut numbered = String::new();
        let mut size = 0;
        for (i, line) in all.iter().enumerate().skip(offset - 1).take(limit) {
            size += line.len() + 1;
            if size > MAX_READ_BYTES && !lines.is_empty() {
                break;
            }
            let number = i + 1;
            numbered.push_str(&format!("{number}: {line}\n"));
            lines.push(json!({ "number": number, "text": line }));
        }
        let shown_end = offset - 1 + lines.len();
        let shown = path.display().to_string();
        let mut output =
            format!("<path>{shown}</path>\n<type>file</type>\n<content>\n{numbered}</content>");
        if shown_end < total {
            output.push_str(&format!(
                "\n\n[Showing lines {offset}-{shown_end} of {total}; pass offset {} to read on.]",
                shown_end + 1
            ));
        }
        let meta = json!({
            "path": shown,
            "offset": offset,
            "lines": lines,
            "total_lines": total,
        });
        Ok((output, meta))
    }

    /// What a `write` or `edit` call would do, without writing: the file's
    /// content before (`None` when it would be created) and after.
    pub fn preview_change(
        &self,
        name: &str,
        input: &Value,
    ) -> Result<(Option<String>, String), String> {
        self.plan_change(name, input)
            .map(|plan| (plan.original, plan.content))
    }

    fn plan_change(&self, name: &str, input: &Value) -> Result<ChangePlan, String> {
        match name {
            WRITE => self.plan_write(input),
            EDIT => self.plan_edit(input),
            other => Err(format!("{other} does not change files")),
        }
    }

    fn plan_write(&self, input: &Value) -> Result<ChangePlan, String> {
        let rel = str_arg(input, "file_path")?;
        let content = str_arg(input, "content")?;
        let path = self.resolve(rel)?;
        let original = match fs::read(&path) {
            Ok(bytes) => Some(
                String::from_utf8(bytes).map_err(|_| format!("{rel} is not a UTF-8 text file"))?,
            ),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("cannot read {rel}: {e}")),
        };
        let verb = if original.is_some() {
            "Wrote"
        } else {
            "Created"
        };
        Ok(ChangePlan {
            summary: format!("{verb} {rel}"),
            path,
            original,
            content: content.to_string(),
        })
    }

    fn plan_edit(&self, input: &Value) -> Result<ChangePlan, String> {
        let rel = str_arg(input, "file_path")?;
        let old = str_arg(input, "old_string")?;
        let new = str_arg(input, "new_string")?;
        let replace_all = input["replace_all"].as_bool().unwrap_or(false);
        if old.is_empty() {
            return Err("old_string is empty; use write to create or replace a whole file".into());
        }
        let path = self.resolve(rel)?;
        let text = fs::read_to_string(&path).map_err(|e| format!("cannot read {rel}: {e}"))?;
        let count = text.matches(old).count();
        if count == 0 {
            return Err(format!("old_string not found in {rel}"));
        }
        if count > 1 && !replace_all {
            return Err(format!(
                "old_string appears {count} times in {rel}; add context to make it unique or set replace_all"
            ));
        }
        let noun = if count == 1 {
            "occurrence"
        } else {
            "occurrences"
        };
        Ok(ChangePlan {
            summary: format!("Edited {rel}: replaced {count} {noun}"),
            path,
            content: text.replace(old, new),
            original: Some(text),
        })
    }

    fn write(&self, input: &Value) -> Result<(String, Value), String> {
        self.apply_change(WRITE, input)
    }

    fn edit(&self, input: &Value) -> Result<(String, Value), String> {
        self.apply_change(EDIT, input)
    }

    fn apply_change(&self, name: &str, input: &Value) -> Result<(String, Value), String> {
        let plan = self.plan_change(name, input)?;
        let rel = str_arg(input, "file_path")?;
        if plan.original.is_none() {
            if let Some(parent) = plan.path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("cannot create {rel}: {e}"))?;
            }
        }
        fs::write(&plan.path, &plan.content).map_err(|e| format!("cannot write {rel}: {e}"))?;
        let shown = plan.path.display().to_string();
        let change = changes::unified_diff(&shown, plan.original.as_deref(), Some(&plan.content));
        let meta = json!({
            "path": shown,
            "created": plan.original.is_none(),
            "additions": change.additions,
            "deletions": change.deletions,
            // This call's own change, for its card; `FileChanged` carries
            // the change since the session's first edit.
            "diff": change.diff,
        });
        Ok((
            format!(
                "{} (+{} −{} lines)",
                plan.summary, change.additions, change.deletions
            ),
            meta,
        ))
    }

    /// The folder a search starts from: `path`, or the project root.
    fn search_root(&self, input: &Value) -> Result<(String, PathBuf), String> {
        let rel = match &input["path"] {
            Value::Null => ".",
            Value::String(s) if s.is_empty() => ".",
            Value::String(s) => s.as_str(),
            _ => return Err("path must be a string".into()),
        };
        Ok((rel.to_string(), self.resolve(rel)?))
    }

    /// A path found under the project root, as the tools show it.
    fn shown(&self, path: &Path) -> String {
        self.project_path(&path.to_string_lossy())
            .unwrap_or_else(|_| path.display().to_string())
    }

    fn glob(&self, input: &Value) -> Result<(String, Value), String> {
        let pattern = str_arg(input, "pattern")?;
        let (rel, base) = self.search_root(input)?;
        if !base.is_dir() {
            return Err(format!("{rel} is not a directory"));
        }
        // A pattern without a separator matches a file name at any depth.
        let full = if pattern.contains('/') {
            pattern.to_string()
        } else {
            format!("**/{pattern}")
        };
        let matcher = globset::GlobBuilder::new(&full)
            .literal_separator(true)
            .build()
            .map_err(|e| format!("invalid glob pattern: {e}"))?
            .compile_matcher();
        let walk = ignore::WalkBuilder::new(&base)
            .standard_filters(false)
            .filter_entry(|entry| entry.file_name() != ".git")
            .build();
        let mut found: Vec<(std::time::SystemTime, PathBuf)> = walk
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_some_and(|t| t.is_file()))
            .filter(|entry| {
                entry
                    .path()
                    .strip_prefix(&base)
                    .is_ok_and(|relative| matcher.is_match(relative))
            })
            .map(|entry| {
                let modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .unwrap_or(std::time::UNIX_EPOCH);
                (modified, entry.into_path())
            })
            .collect();
        found.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        let total = found.len();
        let paths: Vec<String> = found
            .iter()
            .take(MAX_GLOB_FILES)
            .map(|(_, path)| self.shown(path))
            .collect();
        let mut output = if paths.is_empty() {
            "No files found.".to_string()
        } else {
            paths.join("\n")
        };
        if total > MAX_GLOB_FILES {
            output.push_str(&format!(
                "\n[{} more files not shown; narrow the pattern or path]",
                total - MAX_GLOB_FILES
            ));
        }
        let meta = json!({
            "pattern": pattern,
            "path": base.display().to_string(),
            "matches": total,
            "truncated": total > MAX_GLOB_FILES,
        });
        Ok((output, meta))
    }

    fn grep(&self, input: &Value) -> Result<(String, Value), String> {
        let pattern = str_arg(input, "pattern")?;
        let regex =
            regex::Regex::new(pattern).map_err(|e| format!("invalid regular expression: {e}"))?;
        let include = match &input["include"] {
            Value::Null => None,
            Value::String(glob) if glob.is_empty() => None,
            Value::String(glob) => Some(
                globset::GlobBuilder::new(glob)
                    .literal_separator(true)
                    .build()
                    .map_err(|e| format!("invalid include pattern: {e}"))?
                    .compile_matcher(),
            ),
            _ => return Err("include must be a string".into()),
        };
        let (rel, target) = self.search_root(input)?;
        if !target.exists() {
            return Err(format!("{rel} does not exist"));
        }
        // ripgrep's rules: skip ignored, hidden and binary files.
        let walk = ignore::WalkBuilder::new(&target)
            .require_git(false)
            .filter_entry(|entry| entry.file_name() != ".git")
            .build();
        let mut groups: Vec<String> = Vec::new();
        let (mut files, mut matches, mut truncated) = (0, 0, false);
        'files: for entry in walk.filter_map(Result::ok) {
            if !entry.file_type().is_some_and(|t| t.is_file()) {
                continue;
            }
            let path = entry.path();
            if let Some(include) = &include {
                let name = path.file_name().map(Path::new).unwrap_or(path);
                if !include.is_match(name) {
                    continue;
                }
            }
            if entry
                .metadata()
                .is_ok_and(|m| m.len() > MAX_GREP_FILE_BYTES)
            {
                continue;
            }
            let Ok(bytes) = fs::read(path) else {
                continue;
            };
            if bytes[..bytes.len().min(8_192)].contains(&0) {
                continue;
            }
            let text = String::from_utf8_lossy(&bytes);
            let mut group = String::new();
            for (i, line) in text.lines().enumerate() {
                if !regex.is_match(line) {
                    continue;
                }
                if matches == MAX_GREP_MATCHES {
                    truncated = true;
                    if !group.is_empty() {
                        groups.push(format!("{}\n{group}", self.shown(path)));
                        files += 1;
                    }
                    break 'files;
                }
                matches += 1;
                let mut shown = line;
                if shown.len() > MAX_GREP_LINE {
                    let mut end = MAX_GREP_LINE;
                    while !shown.is_char_boundary(end) {
                        end -= 1;
                    }
                    shown = &shown[..end];
                }
                group.push_str(&format!("{}: {shown}\n", i + 1));
            }
            if !group.is_empty() {
                groups.push(format!("{}\n{group}", self.shown(path)));
                files += 1;
            }
        }
        let mut output = if groups.is_empty() {
            "No matches.".to_string()
        } else {
            groups.join("\n").trim_end().to_string()
        };
        if truncated {
            output.push_str(&format!(
                "\n\n[Stopped at {MAX_GREP_MATCHES} matches; narrow the pattern, path or include]"
            ));
        }
        let meta = json!({
            "pattern": pattern,
            "path": target.display().to_string(),
            "files": files,
            "matches": matches,
            "truncated": truncated,
        });
        Ok((output, meta))
    }

    /// Resolves `rel` inside the project root, refusing `..` escapes,
    /// absolute paths elsewhere and symlinks that lead out of the project.
    fn resolve(&self, rel: &str) -> Result<PathBuf, String> {
        let outside = || format!("{rel} is outside the project folder");
        let root = std::path::absolute(&self.root)
            .map(|p| normalize(&p))
            .map_err(|e| format!("project folder is not accessible: {e}"))?;
        let joined = normalize(&root.join(rel));
        if !joined.starts_with(&root) {
            return Err(outside());
        }
        let real_root = self
            .root
            .canonicalize()
            .map_err(|e| format!("project folder is not accessible: {e}"))?;
        let mut existing = joined.as_path();
        while !existing.exists() {
            existing = existing.parent().ok_or_else(outside)?;
        }
        let real = existing
            .canonicalize()
            .map_err(|e| format!("cannot resolve {rel}: {e}"))?;
        if !real.starts_with(&real_root) {
            return Err(outside());
        }
        Ok(joined)
    }
}

/// A checked `write` or `edit`: where it writes, the content before and
/// after, and a summary for the model.
struct ChangePlan {
    path: PathBuf,
    original: Option<String>,
    content: String,
    summary: String,
}

/// An optional whole-number argument; models sometimes send `3.0`.
fn count_arg(input: &Value, key: &str) -> Result<Option<usize>, String> {
    match &input[key] {
        Value::Null => Ok(None),
        Value::Number(n) => n
            .as_f64()
            .filter(|n| *n >= 0.0 && n.fract() == 0.0)
            .map(|n| Some(n as usize))
            .ok_or_else(|| format!("{key} must be a whole number")),
        _ => Err(format!("{key} must be a number")),
    }
}

fn str_arg<'a>(input: &'a Value, key: &str) -> Result<&'a str, String> {
    input[key]
        .as_str()
        .ok_or_else(|| format!("missing string argument: {key}"))
}

/// Resolves `.` and `..` without touching the file system.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

/// Readable text from an HTML page: scripts, styles and comments dropped,
/// block tags turned into line breaks, common entities decoded and blank
/// runs collapsed. Basic by design (ADR 0014).
pub fn html_to_text(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len() / 2);
    let mut i = 0;
    while i < html.len() {
        let rest = &lower[i..];
        if rest.starts_with("<!--") {
            i += rest.find("-->").map_or(rest.len(), |end| end + 3);
            continue;
        }
        if let Some(tag) = ["script", "style", "noscript"]
            .into_iter()
            .find(|tag| rest.starts_with(&format!("<{tag}")))
        {
            let close = format!("</{tag}");
            i += rest.find(&close).map_or(rest.len(), |at| {
                rest[at..].find('>').map_or(rest.len(), |end| at + end + 1)
            });
            continue;
        }
        if let Some(tag) = rest.strip_prefix('<') {
            let end = rest.find('>').map_or(rest.len(), |end| end + 1);
            let name: String = tag
                .chars()
                .skip_while(|c| *c == '/')
                .take_while(|c| c.is_ascii_alphanumeric())
                .collect();
            let closing = tag.starts_with('/');
            // Lines break at both ends of a block, and before each list
            // item, row or line break.
            let block = matches!(
                name.as_str(),
                "p" | "div"
                    | "h1"
                    | "h2"
                    | "h3"
                    | "h4"
                    | "h5"
                    | "h6"
                    | "section"
                    | "article"
                    | "header"
                    | "footer"
                    | "pre"
                    | "table"
                    | "ul"
                    | "ol"
            );
            let item = matches!(name.as_str(), "li" | "tr" | "br");
            if block {
                out.push_str("\n\n");
            } else if item && !closing {
                out.push('\n');
            }
            i += end;
            continue;
        }
        let ch = html[i..].chars().next().unwrap_or(' ');
        out.push(ch);
        i += ch.len_utf8();
    }
    let decoded = out
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&");
    let mut text = String::new();
    let mut blank = 0;
    for line in decoded
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
    {
        if line.is_empty() {
            blank += 1;
            if blank == 1 && !text.is_empty() {
                text.push('\n');
            }
            continue;
        }
        blank = 0;
        text.push_str(&line);
        text.push('\n');
    }
    text.trim().to_string()
}
