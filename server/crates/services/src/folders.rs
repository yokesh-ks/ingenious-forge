//! Folders on the user's disk: checking that one can be opened as a
//! project, and asking the user to choose one with the operating
//! system's folder dialog (PRD §6.2 Projects and session list).

use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use api_types::OpenApp;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum FolderError {
    #[error("the folder path must be absolute")]
    NotAbsolute,
    #[error("that folder does not exist")]
    NotFound,
    #[error("that path is not a folder")]
    NotADirectory,
    #[error("that folder is not a git repository")]
    NotAGitRepo,
}

/// A folder that can be opened as a project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectFolder {
    pub path: PathBuf,
    pub name: String,
}

fn is_git_repo(path: &Path) -> bool {
    // `.git` is a folder in a normal clone and a file in a worktree.
    path.join(".git").exists()
}

pub fn inspect_folder(path: &str) -> Result<ProjectFolder, FolderError> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err(FolderError::NotAbsolute);
    }
    let path = path.canonicalize().map_err(|_| FolderError::NotFound)?;
    if !path.is_dir() {
        return Err(FolderError::NotADirectory);
    }
    if !is_git_repo(&path) {
        return Err(FolderError::NotAGitRepo);
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    Ok(ProjectFolder { path, name })
}

/// The commands that open `path` in `app`, in the order to try them.
fn open_commands(app: OpenApp, path: &str) -> Vec<Vec<&str>> {
    let macos = cfg!(target_os = "macos");
    let windows = cfg!(windows);
    match app {
        OpenApp::FileManager if macos => vec![vec!["open", path]],
        OpenApp::FileManager if windows => vec![vec!["explorer", path]],
        OpenApp::FileManager => vec![vec!["xdg-open", path]],
        OpenApp::VsCode if macos => vec![
            vec!["code", path],
            // A server started outside a login shell may not have `code`.
            vec!["open", "-a", "Visual Studio Code", path],
        ],
        OpenApp::VsCode if windows => vec![vec!["cmd", "/c", "code", path]],
        OpenApp::VsCode => vec![vec!["code", path]],
        OpenApp::Terminal if macos => vec![vec!["open", "-a", "Terminal", path]],
        OpenApp::Terminal if windows => vec![vec!["cmd", "/c", "start", "", "/d", path, "cmd"]],
        // These start in the working directory `open_with` sets.
        OpenApp::Terminal => vec![
            vec!["x-terminal-emulator"],
            vec!["gnome-terminal"],
            vec!["konsole"],
            vec!["xterm"],
        ],
    }
}

/// Opens the folder `path` in `app` on the user's machine.
pub fn open_folder_in(app: OpenApp, path: &Path) -> Result<(), String> {
    let text = path.to_string_lossy();
    // Explorer exits with 1 even when it opened the folder.
    let ignore_exit = cfg!(windows) && app == OpenApp::FileManager;
    open_with(&open_commands(app, &text), path, ignore_exit)
}

/// How long a program gets to report failure; one still running by then,
/// like a terminal, has started.
const OPEN_GRACE: Duration = Duration::from_secs(1);

/// Runs the first of `commands` that is installed, in the folder `path`.
/// `ignore_exit` is for a program whose exit code says nothing about whether
/// it worked.
pub fn open_with(commands: &[Vec<&str>], path: &Path, ignore_exit: bool) -> Result<(), String> {
    if !path.is_dir() {
        return Err(format!("{} no longer exists", path.display()));
    }
    for command in commands {
        let program = command[0];
        let spawned = Command::new(program)
            .args(&command[1..])
            .current_dir(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
        let mut child = match spawned {
            Ok(child) => child,
            Err(err) if err.kind() == ErrorKind::NotFound => continue,
            Err(err) => return Err(format!("could not start {program}: {err}")),
        };
        let started = Instant::now();
        while started.elapsed() < OPEN_GRACE {
            let status = child
                .try_wait()
                .map_err(|err| format!("could not start {program}: {err}"))?;
            if let Some(status) = status {
                return if status.success() || ignore_exit {
                    Ok(())
                } else {
                    Err(format!("{program} could not open {}", path.display()))
                };
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        // Reap it whenever it ends, so it leaves no zombie process.
        std::thread::spawn(move || child.wait());
        return Ok(());
    }
    Err("the program to open this with is not installed".to_string())
}

const MACOS_DIALOGS: &[&[&str]] = &[&[
    "osascript",
    "-e",
    "try",
    "-e",
    "activate",
    "-e",
    "POSIX path of (choose folder with prompt \"Select Project Directory\")",
    // Closing the dialog is an error in AppleScript; report it as no choice.
    "-e",
    "on error number -128",
    "-e",
    "\"\"",
    "-e",
    "end try",
]];

const WINDOWS_DIALOGS: &[&[&str]] = &[&[
    "powershell",
    "-NoProfile",
    "-STA",
    "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; \
     [Console]::OutputEncoding = [Text.Encoding]::UTF8; \
     $d = New-Object System.Windows.Forms.FolderBrowserDialog; \
     $d.Description = 'Select Project Directory'; \
     if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }",
]];

const LINUX_DIALOGS: &[&[&str]] = &[
    &[
        "zenity",
        "--file-selection",
        "--directory",
        "--title=Select Project Directory",
    ],
    &[
        "kdialog",
        "--getexistingdirectory",
        ".",
        "--title",
        "Select Project Directory",
    ],
];

/// Shows the operating system's folder dialog and waits for the user.
/// Returns the chosen folder, or `None` when they close the dialog.
pub fn pick_folder() -> Result<Option<String>, String> {
    if cfg!(target_os = "macos") {
        pick_folder_with(MACOS_DIALOGS, None)
    } else if cfg!(windows) {
        pick_folder_with(WINDOWS_DIALOGS, None)
    } else {
        // zenity and kdialog exit with 1 when the dialog is closed.
        pick_folder_with(LINUX_DIALOGS, Some(1))
    }
}

/// Runs the first of `dialogs` that is installed. Each prints the chosen
/// folder; `cancel_exit` is the exit code that means no folder was chosen.
pub fn pick_folder_with(
    dialogs: &[&[&str]],
    cancel_exit: Option<i32>,
) -> Result<Option<String>, String> {
    for dialog in dialogs {
        let output = Command::new(dialog[0])
            .args(&dialog[1..])
            .stdin(Stdio::null())
            .output();
        let output = match output {
            Ok(output) => output,
            Err(err) if err.kind() == ErrorKind::NotFound => continue,
            Err(err) => return Err(format!("could not open the folder dialog: {err}")),
        };
        if output.status.code().is_some() && output.status.code() == cancel_exit {
            return Ok(None);
        }
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("the folder dialog failed: {}", stderr.trim()));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout.trim_end_matches(['\r', '\n']);
        return Ok((!path.is_empty()).then(|| path.to_string()));
    }
    Err("no folder dialog is available; install zenity or kdialog".to_string())
}
