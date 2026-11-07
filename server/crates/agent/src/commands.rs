//! Slash commands typed in the composer. A command is shown in the session
//! as typed and reaches the model as a fuller prompt.

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

use crate::{instructions, tools::ToolBox};

pub const INIT: &str = "/init";

/// Folders that hold dependencies, build output or tool state rather than
/// the project's own files.
const SKIPPED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "vendor",
    "venv",
    "__pycache__",
];
const MAX_DEPTH: usize = 4;
const MAX_FILES: usize = 5_000;

const BUILD_FILES: &[&str] = &[
    "Cargo.toml",
    "package.json",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "CMakeLists.txt",
    "Makefile",
    "composer.json",
    "mix.exs",
    "Package.swift",
    "deno.json",
    "Dockerfile",
];

const LANGUAGES: &[(&str, &str)] = &[
    ("rs", "Rust"),
    ("ts", "TypeScript"),
    ("tsx", "TypeScript"),
    ("js", "JavaScript"),
    ("jsx", "JavaScript"),
    ("mjs", "JavaScript"),
    ("py", "Python"),
    ("go", "Go"),
    ("java", "Java"),
    ("kt", "Kotlin"),
    ("rb", "Ruby"),
    ("php", "PHP"),
    ("cs", "C#"),
    ("c", "C"),
    ("h", "C"),
    ("cpp", "C++"),
    ("cc", "C++"),
    ("hpp", "C++"),
    ("swift", "Swift"),
    ("ex", "Elixir"),
    ("exs", "Elixir"),
    ("scala", "Scala"),
    ("sh", "Shell"),
];

/// The prompt a slash command stands for, or `None` when `text` is not a
/// known command. Text after the command is passed on as guidance.
pub fn expand(text: &str, tools: &ToolBox) -> Option<String> {
    let text = text.trim();
    let rest = text.strip_prefix(INIT)?;
    if !(rest.is_empty() || rest.starts_with(char::is_whitespace)) {
        return None;
    }
    Some(init_prompt(tools, rest.trim()))
}

fn init_prompt(tools: &ToolBox, guidance: &str) -> String {
    let file = instructions::FILE_NAME;
    let exists = matches!(tools.read_text(file), Ok(Some(_)));
    let task = if exists {
        format!(
            "This project already has an {file}. Read it, then update it in place so it \
             matches the repository as it is now. Keep instructions that still apply."
        )
    } else {
        format!("Create {file} in the project root.")
    };
    let mut prompt = format!(
        "{task}\n\n\
         {file} tells coding agents how to work in this repository. Inspect the \
         repository with your tools first: read the build files and the main folders \
         listed below. Then write a concise file covering:\n\
         - what the project is and how it is laid out (key folders);\n\
         - the commands to build, test, lint and run it, exactly as the build files \
           define them;\n\
         - code style and conventions you can see in the code;\n\
         - anything an agent must or must not do here.\n\
         Only state what you found in the repository. Write the file with \
         write, then summarise what you wrote.\n\n\
         Repository survey:\n{}",
        survey(tools)
    );
    if !guidance.is_empty() {
        prompt.push_str(&format!("\n\nThe user added: {guidance}"));
    }
    prompt
}

/// A short description of the project: languages by file count, build
/// files and top-level folders.
pub fn survey(tools: &ToolBox) -> String {
    let mut languages: BTreeMap<&str, usize> = BTreeMap::new();
    let mut build_files = BTreeSet::new();
    let mut folders = BTreeSet::new();
    let mut files = 0;
    walk(
        tools.root(),
        "",
        0,
        &mut |rel: &str, name: &str, is_dir: bool| {
            if is_dir {
                if !rel.contains('/') {
                    folders.insert(format!("{rel}/"));
                }
                return;
            }
            files += 1;
            if BUILD_FILES.contains(&name) {
                build_files.insert(rel.to_string());
            }
            if let Some((_, language)) = name
                .rsplit_once('.')
                .and_then(|(_, ext)| LANGUAGES.iter().find(|(e, _)| *e == ext))
            {
                *languages.entry(language).or_default() += 1;
            }
        },
        &mut 0,
    );

    let mut by_count: Vec<_> = languages.into_iter().collect();
    by_count.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    let list = |items: Vec<String>| {
        if items.is_empty() {
            "none found".to_string()
        } else {
            items.join(", ")
        }
    };
    let languages = if by_count.is_empty() {
        "no source files recognised".to_string()
    } else {
        by_count
            .iter()
            .map(|(language, n)| format!("{language} ({n} files)"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let truncated = if files >= MAX_FILES {
        format!("\n(Survey stopped after {MAX_FILES} files.)")
    } else {
        String::new()
    };
    format!(
        "- Languages: {languages}\n- Build files: {}\n- Top-level folders: {}{truncated}",
        list(build_files.into_iter().collect()),
        list(folders.into_iter().collect()),
    )
}

/// Visits files and folders under `dir` breadth-limited to `MAX_DEPTH`,
/// skipping hidden entries, `SKIPPED_DIRS` and symlinks.
fn walk(
    dir: &Path,
    prefix: &str,
    depth: usize,
    visit: &mut dyn FnMut(&str, &str, bool),
    seen: &mut usize,
) {
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = read.filter_map(Result::ok).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if *seen >= MAX_FILES {
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if kind.is_dir() {
            if SKIPPED_DIRS.contains(&name.as_str()) {
                continue;
            }
            visit(&rel, &name, true);
            if depth + 1 < MAX_DEPTH {
                walk(&entry.path(), &rel, depth + 1, visit, seen);
            }
        } else if kind.is_file() {
            *seen += 1;
            visit(&rel, &name, false);
        }
    }
}
