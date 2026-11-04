# 0006. Confine shell commands with sandbox-exec on macOS and bubblewrap on Linux

- **Status:** Accepted
- **Date:** 2026-11-04
- **PRD:** §6.1 Sandbox, §6.2 Live session view (session header), §6.2
  Settings, §8 Architecture (Forge Agent: loop, tools, sandbox)

## Context

PRD §6.1 Sandbox requires every command the agent runs to be confined by
an operating-system sandbox: by default the agent can write only inside
the project folder and has no network access, projects can widen this,
and the active sandbox and writable folders are always visible in the UI.
Issue #93 added the `run_shell` tool, which runs `sh -c <command>` in the
project folder in its own process group; nothing confines it yet. Issues
#96 (macOS), #97 (Linux) and #98 (session header) build on this decision,
and #95 asks for it to be recorded and accepted first.

Forces:

- Forge ships as one prebuilt binary per OS (§8), so the sandbox must work
  without a privileged helper, a daemon or code signing entitlements.
- The confinement must cover every process the command starts, not only
  the shell, and must survive the command changing directory.
- File tools (`read_file`, `edit_file`, `list_directory`) already refuse
  paths outside the project in-process; the sandbox is for commands.
- Windows is in §6.1 but has no story in this milestone; it gets its own
  ADR.
- Principle VIII: no new runtime dependency beyond §8 without recording
  the simpler option.

## Decision

Wrap each shell command in the operating system's own sandbox tool,
behind a `Sandbox` interface in the `agent` crate that turns a command,
the writable folders and the network policy into the program and
arguments to spawn:

- **macOS: `sandbox-exec`** with a profile generated per command:
  `(allow default)`, `(deny file-write*)` except `(subpath <folder>)` for
  each writable folder and the device files a shell needs (`/dev/null`,
  `/dev/tty`, `/dev/fd`), and `(deny network*)` unless the project allows
  network.
- **Linux: `bwrap` (bubblewrap)** with the root file system bound
  read-only (`--ro-bind / /`), each writable folder bound read-write,
  fresh `/dev` and `/proc`, `--unshare-net` unless the project allows
  network, and `--die-with-parent`. seccomp filters are not used in this
  step; bubblewrap's namespaces give the write and network confinement
  the PRD asks for.
- **Writable folders** default to the project folder. The session header
  shows the sandbox name and this list (#98); widening it is a later
  Settings story.
- **Fail closed.** When the sandbox tool is missing (for example `bwrap`
  is not installed), `run_shell` refuses to run the command and says how
  to install it. There is no silent fallback to an unconfined shell.

## Alternatives considered

### Landlock on Linux (in-process, through a Rust crate)

- Pros: no external program; unprivileged; fine-grained path rules.
- Cons: needs kernel 5.13 or later, and network rules only from 6.7; adds
  a crate dependency; nothing equivalent on macOS, so two very different
  code paths.
- Rejected because: bubblewrap covers writes and network on the kernels
  Forge users run today, and keeps both OS backends the same shape (wrap
  the command line).

### seccomp-only filtering on Linux

- Pros: in-process, no external tool.
- Cons: seccomp sees system call numbers and arguments, not resolved
  paths, so "write only inside this folder" cannot be expressed safely.
- Rejected because: it cannot implement the PRD's write rule on its own.

### Containers (Docker or Podman)

- Pros: strong isolation; same on every OS with a container runtime.
- Cons: needs a daemon or a VM on macOS, an image to pull, and slow
  start-up per command; heavy for `npx ingenious-forge`.
- Rejected because: §8 ships one binary and no services; the start-up cost
  per command breaks the live-streaming feel of #93 and #94.

### No OS sandbox; rely on approval prompts

- Pros: nothing to build or install.
- Cons: Full-auto mode (§6.1 Approval modes) runs commands without
  prompts, so nothing would stop a command writing anywhere.
- Rejected because: §6.1 makes the sandbox P0 and on by default.

## Consequences

- Good: commands, and every process they start, can write only inside the
  project folder and have no network by default on macOS and Linux; the
  same `Sandbox` interface takes a Windows backend later (§6.2 extensible
  core).
- Bad: Apple marks `sandbox-exec` as deprecated, although it still ships
  and is widely used; a future macOS could remove it, which would need a
  new ADR. Linux users must install bubblewrap (`apt install bubblewrap`,
  `dnf install bubblewrap`); without it, shell commands are refused.
  Some tools that write caches outside the project (for example `~/.npm`,
  `~/.cargo`) fail until a project widens its writable folders.
- Follow-up: #96 (macOS backend), #97 (Linux backend and network block),
  #98 (sandbox and writable folders in the session header); a Settings
  story for per-project writable folders and network; a Windows sandbox
  ADR.
