//! The agent's built-in file tools (PRD §6.1 Built-in tools: Read, Edit,
//! List). Every path is resolved inside the project root; a path that
//! escapes it is refused.

use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;
use serde_json::{json, Value};

pub const READ_FILE: &str = "read_file";
pub const EDIT_FILE: &str = "edit_file";
pub const LIST_DIRECTORY: &str = "list_directory";

const MAX_READ_BYTES: usize = 200_000;
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
}

#[derive(Debug, Clone)]
pub struct ToolBox {
    root: PathBuf,
}

impl ToolBox {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn specs(&self) -> Vec<ToolSpec> {
        vec![
            ToolSpec {
                name: READ_FILE,
                description: "Read a UTF-8 text file in the project. Paths are relative to the project root.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "File path relative to the project root" }
                    },
                    "required": ["path"],
                    "additionalProperties": false
                }),
            },
            ToolSpec {
                name: EDIT_FILE,
                description: "Edit a file by replacing old_string with new_string exactly. old_string must match once unless replace_all is true. An empty old_string creates a new file containing new_string.",
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "File path relative to the project root" },
                        "old_string": { "type": "string", "description": "Exact text to replace; empty to create a new file" },
                        "new_string": { "type": "string", "description": "Replacement text" },
                        "replace_all": { "type": "boolean", "description": "Replace every occurrence" }
                    },
                    "required": ["path", "old_string", "new_string"],
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
        ]
    }

    pub fn run(&self, name: &str, input: &Value) -> ToolOutcome {
        let result = match name {
            READ_FILE => self.read_file(input),
            EDIT_FILE => self.edit_file(input),
            LIST_DIRECTORY => self.list_directory(input),
            other => Err(format!("unknown tool: {other}")),
        };
        match result {
            Ok(output) => ToolOutcome {
                output,
                is_error: false,
            },
            Err(output) => ToolOutcome {
                output,
                is_error: true,
            },
        }
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

    fn read_file(&self, input: &Value) -> Result<String, String> {
        let rel = str_arg(input, "path")?;
        let path = self.resolve(rel)?;
        let bytes = fs::read(&path).map_err(|e| format!("cannot read {rel}: {e}"))?;
        let text =
            String::from_utf8(bytes).map_err(|_| format!("{rel} is not a UTF-8 text file"))?;
        if text.len() <= MAX_READ_BYTES {
            return Ok(text);
        }
        let mut end = MAX_READ_BYTES;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        Ok(format!(
            "{}\n\n[truncated: file is {} bytes, showing the first {end}]",
            &text[..end],
            text.len()
        ))
    }

    fn edit_file(&self, input: &Value) -> Result<String, String> {
        let rel = str_arg(input, "path")?;
        let old = str_arg(input, "old_string")?;
        let new = str_arg(input, "new_string")?;
        let replace_all = input["replace_all"].as_bool().unwrap_or(false);
        let path = self.resolve(rel)?;

        if old.is_empty() {
            if path.exists() {
                return Err(format!(
                    "{rel} already exists; pass the text to replace as old_string"
                ));
            }
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("cannot create {rel}: {e}"))?;
            }
            fs::write(&path, new).map_err(|e| format!("cannot write {rel}: {e}"))?;
            return Ok(format!("Created {rel} (+{} lines)", new.lines().count()));
        }

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
        fs::write(&path, text.replace(old, new)).map_err(|e| format!("cannot write {rel}: {e}"))?;
        let noun = if count == 1 {
            "occurrence"
        } else {
            "occurrences"
        };
        Ok(format!(
            "Edited {rel}: replaced {count} {noun} (+{} −{} lines)",
            new.lines().count(),
            old.lines().count()
        ))
    }

    fn list_directory(&self, input: &Value) -> Result<String, String> {
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
        if entries.is_empty() {
            return Ok("(empty directory)".into());
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
        Ok(out)
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
