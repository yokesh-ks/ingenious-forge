//! The agent's built-in file tools (PRD §6.1 Built-in tools: `read`,
//! `write`, `edit`, and directory listing). Every path is resolved inside
//! the project root; a path that escapes it is refused. Each result keeps
//! structured details (`meta`) beside its text for the UI (ADR 0012).

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
pub const LIST_DIRECTORY: &str = "list_directory";
/// Runs in the agent rather than here, since it streams (see `shell`).
pub const BASH: &str = "bash";

const MAX_READ_BYTES: usize = 200_000;
const DEFAULT_READ_LINES: usize = 2_000;
const MAX_LIST_ENTRIES: usize = 1_000;

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
                name: LIST_DIRECTORY,
                description: "List the entries of a directory in the project; directories end with '/'.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Directory relative to the project root; defaults to the root" }
                    },
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
        ]
    }

    pub fn run(&self, name: &str, input: &Value) -> ToolOutcome {
        let result = match name {
            READ => self.read(input),
            WRITE => self.write(input),
            EDIT => self.edit(input),
            LIST_DIRECTORY => self.list_directory(input),
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
        });
        Ok((
            format!(
                "{} (+{} −{} lines)",
                plan.summary, change.additions, change.deletions
            ),
            meta,
        ))
    }

    fn list_directory(&self, input: &Value) -> Result<(String, Value), String> {
        let rel = match &input["path"] {
            Value::Null => ".",
            Value::String(s) if s.is_empty() => ".",
            Value::String(s) => s.as_str(),
            _ => return Err("path must be a string".into()),
        };
        let path = self.resolve(rel)?;
        let read = fs::read_dir(&path).map_err(|e| format!("cannot list {rel}: {e}"))?;
        let mut entries: Vec<String> = read
            .filter_map(Result::ok)
            .filter(|e| e.file_name() != ".git")
            .map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                if e.file_type().is_ok_and(|t| t.is_dir()) {
                    format!("{name}/")
                } else {
                    name
                }
            })
            .collect();
        let shown = path.display().to_string();
        if entries.is_empty() {
            let meta = json!({ "path": shown, "entries": 0, "truncated": false });
            return Ok(("(empty directory)".into(), meta));
        }
        entries.sort();
        let total = entries.len();
        entries.truncate(MAX_LIST_ENTRIES);
        let mut out = entries.join("\n");
        if total > MAX_LIST_ENTRIES {
            out.push_str(&format!(
                "\n[{} more entries not shown]",
                total - MAX_LIST_ENTRIES
            ));
        }
        let meta = json!({
            "path": shown,
            "entries": total,
            "truncated": total > MAX_LIST_ENTRIES,
        });
        Ok((out, meta))
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
