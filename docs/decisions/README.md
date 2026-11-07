# Architecture decision records

Each significant technical decision for Forge is recorded here as a
numbered ADR: its context, the alternatives considered and its
consequences. Accepted ADRs are never rewritten; a changed decision gets a
new ADR that supersedes the old one. See
[0001](0001-record-architecture-decisions.md) for the format and rules.

| # | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted | 2026-10-31 |
| [0002](0002-shadcn-tailwind-web-ui.md) | Adopt Tailwind CSS and Shadcn UI for the web frontend | Proposed | 2026-11-02 |
| [0003](0003-server-cargo-workspace.md) | Split the Rust server into a Cargo workspace by PRD module | Proposed | 2026-11-02 |
| [0004](0004-model-client-and-typed-api.md) | Call model providers over HTTP with reqwest and generate the typed API with ts-rs | Proposed | 2026-11-02 |
| [0005](0005-session-log-on-disk.md) | Persist each session as an append-only JSON Lines log | Proposed | 2026-11-03 |
| [0006](0006-os-sandbox-for-shell-commands.md) | Confine shell commands with sandbox-exec on macOS and bubblewrap on Linux | Accepted | 2026-11-04 |
| [0007](0007-pty-terminal.md) | Run the workspace terminal on a server PTY and render it with xterm.js | Proposed | 2026-11-04 |
| [0008](0008-encrypt-stored-secrets.md) | Encrypt stored secrets with AES-256-GCM and a local key file | Proposed | 2026-11-04 |
| [0009](0009-feature-based-web-ui-structure.md) | Organize `apps/web/src` by feature instead of by file type | Proposed | 2026-11-06 |
| [0010](0010-full-shadcn-component-catalog.md) | Pre-install the full Shadcn component catalog | Proposed | 2026-11-06 |
| [0011](0011-use-the-radix-vega-shadcn-preset.md) | Use the radix-vega Shadcn preset and its dependencies | Proposed | 2026-11-07 |
| [0012](0012-record-timing-steps-and-usage-in-the-session-log.md) | Record timing, model steps and token usage in the session log | Accepted | 2026-11-07 |
| [0013](0013-render-markdown-with-react-markdown-and-shiki.md) | Render Markdown with react-markdown, remark-gfm and Shiki | Proposed | 2026-11-07 |
