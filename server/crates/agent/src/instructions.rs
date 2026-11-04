//! Project instructions (PRD §6.1 Project instructions): `AGENTS.md` files
//! that tell the agent how to work in a repository. The root file goes in
//! the system prompt at session start; a nested one is added to the first
//! tool result that touches its folder.

use std::collections::BTreeSet;

use crate::tools::ToolBox;

pub const FILE_NAME: &str = "AGENTS.md";

/// The system prompt for a session in `tools`' project, or `None` when the
/// project has no usable root `AGENTS.md`.
pub fn system_prompt(tools: &ToolBox) -> Option<String> {
    let text = read(tools, FILE_NAME)?;
    Some(format!(
        "The project's {FILE_NAME} holds the user's instructions for working in this \
         repository. Follow them.\n\n<project_instructions path=\"{FILE_NAME}\">\n{text}\n\
         </project_instructions>"
    ))
}

/// The nested `AGENTS.md` files that apply to `path` and are not in
/// `loaded` yet, outermost first, as `(file path, text)`. `is_dir` says
/// whether `path` is itself a folder. Each returned file is added to
/// `loaded`; the root file is never returned, since it is in the system
/// prompt.
pub fn nested(
    tools: &ToolBox,
    path: &str,
    is_dir: bool,
    loaded: &mut BTreeSet<String>,
) -> Vec<(String, String)> {
    let Ok(path) = tools.project_path(path) else {
        return Vec::new();
    };
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    let depth = if is_dir {
        parts.len()
    } else {
        parts.len().saturating_sub(1)
    };
    let mut found = Vec::new();
    for end in 1..=depth {
        let file = format!("{}/{FILE_NAME}", parts[..end].join("/"));
        if !loaded.insert(file.clone()) {
            continue;
        }
        if let Some(text) = read(tools, &file) {
            found.push((file, text));
        }
    }
    found
}

/// Formats nested instructions for appending to a tool result.
pub fn render_nested(found: &[(String, String)]) -> String {
    found
        .iter()
        .map(|(file, text)| {
            let folder = file.trim_end_matches(FILE_NAME);
            format!(
                "\n\n<project_instructions path=\"{file}\">\nThese instructions apply to \
                 files under {folder}. Follow them there.\n\n{text}\n</project_instructions>"
            )
        })
        .collect()
}

fn read(tools: &ToolBox, rel: &str) -> Option<String> {
    match tools.read_text(rel) {
        Ok(Some(text)) if !text.trim().is_empty() => Some(text.trim_end().to_string()),
        Ok(_) => None,
        Err(err) => {
            tracing::warn!(%err, "skipping project instructions");
            None
        }
    }
}
