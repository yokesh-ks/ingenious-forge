//! The command sandbox (PRD §6.1 Sandbox; ADR 0006). Each shell command is
//! wrapped in the operating system's sandbox tool so it, and everything it
//! starts, can write only inside the writable folders and has no network
//! unless allowed. When the sandbox is needed but unusable, commands are
//! refused rather than run unconfined.

use std::path::{Path, PathBuf};

pub const SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";

/// What a sandboxed command may do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Policy {
    /// Folders the command may write to, resolved through symlinks.
    pub writable: Vec<PathBuf>,
    pub network: bool,
}

impl Policy {
    /// The default: write only inside the project folder, no network.
    pub fn project(root: &Path) -> Self {
        Self {
            writable: vec![root.canonicalize().unwrap_or_else(|_| root.to_path_buf())],
            network: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Sandbox {
    /// No confinement. Only for tests and callers that confine commands
    /// themselves; the server always detects a real sandbox.
    Off,
    /// macOS `sandbox-exec` with a generated profile.
    SandboxExec,
    /// Linux bubblewrap (`bwrap`) at this path.
    Bubblewrap(PathBuf),
    /// A sandbox is required but cannot be used; commands are refused
    /// with this reason.
    Unavailable(String),
}

impl Sandbox {
    /// The sandbox this machine supports.
    pub fn detect() -> Self {
        if cfg!(target_os = "macos") {
            macos_sandbox(Path::new(SANDBOX_EXEC).exists(), probe_sandbox_exec)
        } else if cfg!(target_os = "linux") {
            linux_sandbox(find_on_path("bwrap"), probe_bwrap)
        } else {
            Sandbox::Unavailable(
                "Forge has no command sandbox for this operating system yet".into(),
            )
        }
    }

    /// The name shown in the session header.
    pub fn name(&self) -> &'static str {
        match self {
            Sandbox::Off => "none",
            Sandbox::SandboxExec => "sandbox-exec",
            Sandbox::Bubblewrap(_) => "bubblewrap",
            Sandbox::Unavailable(_) => "unavailable",
        }
    }

    /// The program and arguments that run `command` with `bash -c` (or
    /// `sh -c` where bash is not installed) under this sandbox.
    pub fn command(
        &self,
        policy: &Policy,
        command: &str,
    ) -> Result<(PathBuf, Vec<String>), String> {
        let program = shell_program();
        let shell = || vec![program.to_string(), "-c".into(), command.into()];
        match self {
            Sandbox::Off => Ok((program.into(), shell()[1..].to_vec())),
            Sandbox::SandboxExec => {
                let mut args = vec!["-p".to_string(), sandbox_exec_profile(policy)];
                args.extend(shell());
                Ok((SANDBOX_EXEC.into(), args))
            }
            Sandbox::Bubblewrap(bwrap) => {
                let mut args = bwrap_args(policy);
                args.extend(shell());
                Ok((bwrap.clone(), args))
            }
            Sandbox::Unavailable(reason) => Err(format!(
                "Commands are not run because the sandbox is unavailable: {reason}"
            )),
        }
    }
}

/// The shell commands run in: bash, as the `bash` tool says, or `sh`
/// where bash is not installed.
pub fn shell_program() -> &'static str {
    if Path::new("/bin/bash").exists() {
        "/bin/bash"
    } else {
        "/bin/sh"
    }
}

/// The Linux sandbox: bubblewrap at `bwrap` when `probe` shows it can
/// start a sandbox here, otherwise unavailable with what to do about it.
pub fn linux_sandbox(
    bwrap: Option<PathBuf>,
    probe: impl Fn(&Path) -> Result<(), String>,
) -> Sandbox {
    let Some(bwrap) = bwrap else {
        return Sandbox::Unavailable(
            "bubblewrap (bwrap) is not installed; install it, for example with \
             `sudo apt install bubblewrap` or `sudo dnf install bubblewrap`, and restart Forge"
                .into(),
        );
    };
    match probe(&bwrap) {
        Ok(()) => Sandbox::Bubblewrap(bwrap),
        Err(err) => Sandbox::Unavailable(format!(
            "bubblewrap cannot start a sandbox here ({err}); this system may restrict \
             unprivileged user namespaces"
        )),
    }
}

/// bubblewrap options: the root file system read-only, each writable
/// folder bound read-write, fresh /dev and /proc, no network unless
/// allowed, and the sandbox ends with Forge. The command follows `--`.
pub fn bwrap_args(policy: &Policy) -> Vec<String> {
    let mut args: Vec<String> = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc"]
        .map(String::from)
        .to_vec();
    for folder in &policy.writable {
        let folder = folder.to_string_lossy().into_owned();
        args.extend(["--bind".to_string(), folder.clone(), folder]);
    }
    if !policy.network {
        args.push("--unshare-net".into());
    }
    args.extend(["--die-with-parent".to_string(), "--".into()]);
    args
}

fn find_on_path(program: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(program))
            .find(|path| path.is_file())
    })
}

/// The macOS sandbox: `sandbox-exec` when it is `installed` and `probe`
/// shows it can start a sandbox, otherwise unavailable with the reason.
pub fn macos_sandbox(installed: bool, probe: impl Fn() -> Result<(), String>) -> Sandbox {
    if !installed {
        return Sandbox::Unavailable(format!(
            "{SANDBOX_EXEC} is missing, so commands cannot be sandboxed"
        ));
    }
    match probe() {
        Ok(()) => Sandbox::SandboxExec,
        Err(err) => Sandbox::Unavailable(format!("sandbox-exec cannot start a sandbox ({err})")),
    }
}

/// Runs `true` under the default `sandbox-exec` profile to check it works.
fn probe_sandbox_exec() -> Result<(), String> {
    let out = std::process::Command::new(SANDBOX_EXEC)
        .arg("-p")
        .arg(sandbox_exec_profile(&Policy {
            writable: Vec::new(),
            network: false,
        }))
        .arg("/usr/bin/true")
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Runs `true` in a minimal bubblewrap sandbox to check it works.
fn probe_bwrap(bwrap: &Path) -> Result<(), String> {
    let out = std::process::Command::new(bwrap)
        .args(bwrap_args(&Policy {
            writable: Vec::new(),
            network: false,
        }))
        .arg("/bin/true")
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// A `sandbox-exec` profile: everything allowed except writes outside
/// `policy.writable` (and the device files a shell needs) and, unless
/// allowed, the network.
pub fn sandbox_exec_profile(policy: &Policy) -> String {
    let mut profile =
        String::from("(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write*");
    for folder in &policy.writable {
        profile.push_str(&format!(
            "\n  (subpath {})",
            sbpl_string(&folder.to_string_lossy())
        ));
    }
    profile.push_str(
        "\n  (literal \"/dev/null\") (literal \"/dev/zero\") (literal \"/dev/dtracehelper\")\
         \n  (regex #\"^/dev/tty\") (regex #\"^/dev/fd/\"))\n",
    );
    if !policy.network {
        profile.push_str("(deny network*)\n");
    }
    profile
}

/// A string literal in the sandbox profile language.
fn sbpl_string(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}
