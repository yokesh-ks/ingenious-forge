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
    /// A sandbox is required but cannot be used; commands are refused
    /// with this reason.
    Unavailable(String),
}

impl Sandbox {
    /// The sandbox this machine supports.
    pub fn detect() -> Self {
        if cfg!(target_os = "macos") {
            if Path::new(SANDBOX_EXEC).exists() {
                Sandbox::SandboxExec
            } else {
                Sandbox::Unavailable(format!(
                    "{SANDBOX_EXEC} is missing, so commands cannot be sandboxed"
                ))
            }
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
            Sandbox::Unavailable(_) => "unavailable",
        }
    }

    /// The program and arguments that run `command` with `sh -c` under
    /// this sandbox.
    pub fn command(
        &self,
        policy: &Policy,
        command: &str,
    ) -> Result<(PathBuf, Vec<String>), String> {
        let shell = || vec!["/bin/sh".to_string(), "-c".into(), command.into()];
        match self {
            Sandbox::Off => Ok(("/bin/sh".into(), shell()[1..].to_vec())),
            Sandbox::SandboxExec => {
                let mut args = vec!["-p".to_string(), sandbox_exec_profile(policy)];
                args.extend(shell());
                Ok((SANDBOX_EXEC.into(), args))
            }
            Sandbox::Unavailable(reason) => Err(format!(
                "Commands are not run because the sandbox is unavailable: {reason}"
            )),
        }
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
