# 0007. Run the workspace terminal on a server PTY and render it with xterm.js

- **Status:** Proposed
- **Date:** 2026-11-04
- **PRD:** §6.2 Workspace panel, §8 Architecture

## Context

PRD §6.2 Workspace panel asks for "an interactive terminal in the project
folder" next to the chat. Issue #103 requires a real PTY whose working
directory is the project folder, commands whose output appears as they
run, and a terminal that stays alive when the user moves to another
session and back. Interactive programs (editors, prompts, `top`, colour
output, line editing) only behave when they see a terminal, so piping a
shell's stdin and stdout is not enough. Principle VIII asks that each new
dependency records the simpler option and why it falls short.

## Decision

- The server opens one PTY per project with the `portable-pty` crate,
  running the user's `$SHELL` (or `/bin/sh`) in the project folder with
  `TERM=xterm-256color`. It lives on the server, independent of any
  browser connection, until the shell exits; a reconnecting browser gets
  the recent output (the last 64 KB) and then live output.
- The browser talks to it over its own WebSocket,
  `/api/projects/{id}/terminal`: output as binary frames; input and resize
  as JSON text frames (`TerminalInput` in `api-types`); an `exit` text
  frame when the shell ends.
- The web UI renders it with `@xterm/xterm` and sizes it with
  `@xterm/addon-fit`.

## Alternatives considered

### Pipes to `sh` without a PTY, shown in a `<pre>`

- Pros: no new dependency; reuses the `run_shell` streaming from #93.
- Cons: programs see no terminal: no prompt, no line editing, no colours,
  no full-screen programs, no Ctrl-C to the foreground job.
- Rejected because: #103 asks for a PTY and an interactive terminal.

### Open the PTY with `libc`/`nix` directly

- Pros: a thinner dependency.
- Cons: `openpty`, `setsid`, controlling-terminal and window-size handling
  by hand, and a separate implementation for Windows (§8 ships a Windows
  binary).
- Rejected because: `portable-pty` already covers macOS, Linux and
  Windows ConPTY behind one interface.

### Write a terminal emulator in React

- Pros: no frontend dependency.
- Cons: escape-sequence parsing, cursor movement, alternate screen and
  selection are a large, well-solved problem.
- Rejected because: xterm.js is the standard browser terminal and is far
  less code to own.

## Consequences

- Good: a real interactive shell in the browser that survives navigation
  between sessions.
- Bad: two new dependencies (`portable-pty` on the server; `@xterm/xterm`
  and `@xterm/addon-fit` in the web bundle, about 300 KB unminified). The
  terminal is not confined by the agent's sandbox: it is the user's own
  shell, like any terminal they open.
- Follow-up: none for #103; closing a terminal from the UI and more than
  one terminal per project can be later stories.
