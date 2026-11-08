# Ingenious Forge — Product Requirements Document

| | |
|---|---|
| **Status** | Draft v0.5 |
| **Owner** | yokesh-ks |
| **Last updated** | 2026-10-30 |

---

## 1. Summary

Ingenious Forge is a web-native coding harness. Engineers open a project in the browser, give an AI coding agent a task, watch and steer its work live, review the changes, and commit them.

Forge ships as a **web UI launched with `npx`**. One command starts Forge on the user's machine and opens it in their browser — there is no desktop app or terminal UI to install. Every feature is delivered through the web interface, which keeps the product simple, accessible, and the same on macOS, Linux and Windows.

Forge is built in two stages:

1. **First release — Forge Agent + Forge Web UI**
   - **Forge Agent** — the coding agent: it reads and edits code, runs commands in a sandbox, asks for approval when it should, and keeps a durable session history.
   - **Forge Web UI** — a local server started by `npx` that runs the agent, and the browser interface that is the only way to use it: live session view, workspace panel, diff review and git actions.
2. **Later release — Forge Board**
   - A kanban board where every task gets its own isolated workspace and runs in parallel with others, ending in a reviewed, merged pull request.

## 2. Problem

| Problem | Forge's answer |
|---|---|
| Terminal-only agents are hard to follow: long scrolling output, no overview of what changed | A browser view that shows every message, tool call, command and diff as it happens, with a changed-files panel |
| Desktop apps must be installed and differ per OS | Nothing to install beyond Node.js: `npx ingenious-forge` and work in the browser, identical on every OS |
| Agents act without enough control or visibility | A sandbox by default, clear approval modes, and inline approval prompts |
| Reviewing and committing agent changes means jumping to other tools | Diff review and git actions in the same page as the session |
| *(Later)* Running several agents at once causes them to collide in one checkout | *(Forge Board)* One isolated worktree per task |

## 3. Goals and non-goals

### Goals — first release
- **G1** A complete coding agent that can take a task from description to finished change on its own.
- **G2** A web UI that is the single place to run, watch, steer and review the agent.
- **G3** One-command launch (`npx ingenious-forge`) that opens Forge in the browser.

### Goals — later releases
- **G4** A planning-to-merge workflow on a kanban board with parallel, isolated workspaces.
- **G5** An optional hosted team mode.

### Non-goals
- A desktop application. Forge is web-only.
- A terminal UI or editor extension as an alternative way to use Forge.
- Training or hosting our own models.
- Replacing the code editor.
- Version control systems other than git.

## 4. Users

| Persona | What they need from Forge |
|---|---|
| **Solo engineer** | Hand a coding task to an agent, follow its progress in the browser, and keep only the changes they like |
| **Reviewer** | See exactly what the agent did — commands, edits, reasoning — before accepting it |
| **CI / automation** | Headless runs triggered from scripts or pipelines with machine-readable results |
| *(Later)* **Team** | A shared board and visibility of agent work across members |

## 5. Core workflow (first release)

```mermaid
flowchart LR
    A[npx ingenious-forge] --> B[Open a project folder]
    B --> C[Start a session<br/>describe the task]
    C --> D[Agent works<br/>live view, approvals, steering]
    D --> E[Review changed files<br/>and diffs]
    E -- ask for changes --> D
    E -- accept --> F[Commit / push<br/>optionally open a PR]
```

1. The user runs `npx ingenious-forge`; the browser opens on the Forge home page.
2. They pick a project folder (a git repository) or a recent project.
3. They start a session and describe the task, optionally attaching images.
4. The agent works. The user watches live, answers approval prompts, or steers it mid-turn.
5. The changed-files panel shows every file the agent touched with its diff. The user comments or asks for changes in the chat.
6. The user accepts: they ask the agent in the chat to commit, push, and optionally open a pull request. Or they discard the changes.

---

## 6. Features

Priority: **P0** = first release (MVP), **P1** = v1.0, **P2** = later.

### 6.1 Forge Agent

The agent that does the coding work. It runs on the local server, talks to a language model, and acts on the project through a fixed set of tools.

#### Agent loop — P0
The agent works in turns: it sends the conversation to the model, streams the reply, runs any tools the model asks for, feeds the results back, and repeats until the task is finished. Users can **interrupt** a turn at any point or **steer** it by sending a message while it is running; the agent picks the message up at its next step instead of starting over.

#### Built-in tools — P0
| Tool | What it does |
|---|---|
| **`bash`** | Runs a shell command with a short description of its purpose, and returns output and exit code |
| **`read`** | Reads a text file and returns numbered lines, from an optional start line up to a line limit |
| **`write`** | Creates a file or replaces its whole content; the change shows up as a diff |
| **`edit`** | Replaces exact text in an existing file; the change shows up as a diff |
| **`glob`** | Finds files whose paths match a pattern |
| **`grep`** | Searches file contents with a regular expression and returns matching lines with line numbers |
| **`web_fetch`** | Fetches a web page and returns it as text |
| **`todo_write`** | Records and updates the agent's task list for multi-step work |
| **`ask_user_question`** | Asks the user a question and waits for the answer |

The model can call several tools in one reply; the agent runs them and returns every result before the next request. Each result keeps structured details beside its text, such as the line numbers and total line count of a read, so the UI can present it.

#### Sandbox — P0
Every command the agent runs is confined by an operating-system sandbox on macOS, Linux and Windows. By default the agent can write only inside the project folder and has no network access; projects can widen this (for example, allow network for package installs). The current sandbox and writable folders are always visible in the UI.

#### Approval modes — P0
Users choose how much the agent may do without asking:
- **Ask** — approve every edit and command.
- **Auto-edit** — edits apply freely; commands need approval.
- **Full-auto** — everything runs inside the sandbox without prompts.

Approval prompts appear inline in the chat and can be answered "once" or "always for this command".

#### Project instructions (`AGENTS.md`) — P0
Each repository can hold an `AGENTS.md` file (and nested ones in subfolders) describing conventions, commands and do's and don'ts. The agent loads them automatically. `/init` generates a first version by inspecting the repository.

#### Models and reasoning effort — P0
Users pick the model provider, the model and the reasoning effort per session, and can change them from the composer between turns; the next message uses the new choice. The MVP ships Anthropic, DeepSeek, Google, NVIDIA, OpenAI, OpenRouter and Vercel AI Gateway, and the user can add a custom provider by its base URL and API protocol (OpenAI Chat Completions, OpenAI Responses or Anthropic Messages). Providers plug in through adapters, so new providers can be added without changing the agent.

#### Sessions and resume — P0
Every session is recorded as an append-only log of messages, tool calls and results. Sessions survive server restarts and can be resumed, forked, or replayed for debugging. Each entry records when it happened, and each model request records where it starts and ends, when its first token arrived and the token usage the provider reported, so a session can be measured after the fact.

#### Context management — P1
When a long session approaches the model's context limit, older parts are summarized automatically so the agent can keep working without losing the thread.

#### Image input — P1
Screenshots, mockups and diagrams can be attached to a prompt; the agent uses them as context (for example, "make the page look like this").

#### Headless mode (`forge exec`) — P1
Runs a task without the UI, for scripts and CI pipelines only — it is an automation entry point, not an alternative interface for people. It prints progress, exits with a meaningful code, and can emit a JSON result describing what was changed.

#### MCP tools — P1
Users connect Model Context Protocol servers (local or remote) to give the agent extra tools — databases, issue trackers, documentation. An MCP page in settings adds servers, handles sign-in, and lists available tools.

#### Subagents — P1
The agent can hand focused jobs (research a module, write tests, investigate a failure) to helper agents that run in parallel and report back, keeping the main session focused.

#### Code review command (`/review`) — P1
Reviews uncommitted changes, a commit, or a whole branch and returns prioritized findings without changing any files.

#### Skills and hooks — P2
**Skills** are reusable instruction packs the agent loads when relevant (e.g. "release process"). **Hooks** run user scripts before or after tool calls (e.g. format after every edit, block certain commands).

#### Cloud tasks — P2
Send a task to a remote Forge environment, close the laptop, and apply the finished result to the local repository later.

### 6.2 Forge Web UI

How Forge is delivered and used: a local server that owns the agent and projects, and the browser interface that connects to it.

#### `npx` launch — P0
`npx ingenious-forge` downloads the package, starts the server on a free local port and opens the web UI in the default browser. Flags cover the port, host binding and whether to open the browser. Running the same command again updates to the latest version. The only prerequisites are Node.js and git.

#### Host server — P0
A single server process runs the agent and exposes it over HTTP and WebSocket to the web UI. It binds to `localhost` by default. Because state lives in the server, closing the browser tab does not stop a running agent; reopening the page reconnects to it, and several tabs can view the same session.

#### App navigation — P0
A global icon rail on the far left of every page holds the app's sections: Work, Artifacts, Scheduled, Plugins, Sites, Code Review and Settings. A slim top bar above it holds the Forge name and the theme toggle. Work opens the projects area and is the only section with the project sidebar; Settings has its own sidebar of settings pages. Artifacts, Scheduled, Plugins, Sites and Code Review each open a "coming soon" placeholder page for now, and listing them here does not commit to any feature behind them.

#### Projects and session list — P0
The Work section's sidebar lists recent projects, with the main area empty until one is chosen. An icon in the sidebar's Projects header opens the operating system's folder dialog, titled "Select Project Directory", to open another folder from disk. Each project expands in that sidebar to list its sessions (title and status) so the user can switch between them or resume old ones. A project's first session starts when it is opened with none. Each project row has an icon that starts a new session and a menu to rename the project (its name in Forge only), show its folder in the system file manager, or delete the workspace. Deleting asks for confirmation, is refused while one of its sessions is running, and removes the project and its session history from Forge without touching the folder on disk. Each session row has icons to pin and archive it and a menu to pin it, rename it, fork it, copy its id, open the project folder in the system file manager, VS Code or a terminal, or archive it. Pinned sessions stay at the top of the project's list. Forking starts a new session with a copy of the conversation so far, the same model and the same approval mode. Archiving hides a session under the project's Archived group, from where it can be restored; a running session can be neither forked nor archived.

#### Live session view — P0
The agent's work streams into the browser as it happens: messages (rendered markdown and code), each tool call with its input and output, command output as it prints, and diffs as files change. Long sessions stay fast, and a dropped connection reconnects without losing or duplicating output.

Each turn has a status row: while running it shows the elapsed time; once finished it reads "Completed in", "Failed" or "Stopped". A turn that completed normally folds its work under that row, leaving the user's message and every reply visible; a failed or stopped turn stays open. Within a turn, the model's reasoning, tool calls and injected context form groups, and each reply ends a group. A group's title names the kinds of work it did, most frequent first, such as "Ran commands and read files", or "Analysis completed" when it called no tool. A group opens to one row per item: the tool's name and a short detail (a command's description, a file name as a link that opens the file in the workspace panel), or the first line of a reasoning block. Each row opens on its own: a command shows its folder, command, output and a copy button; a read shows the file's lines with line numbers, syntax highlighting, wrap and copy, showing only the first and last four lines of a long file until expanded; reasoning shows its full text. Every tool row has an Inspect action that opens the call in the Trajectory view. A failed turn shows a red row with the error and its code. Under each reply are copy, rating and share actions and the turn's token usage. Below the composer, a line shows the session's turns and steps, output speed, total tokens, cache hit rate and how much of the model's context window is in use.

#### Composer — P0
A row above the box shows the open project at the left, with a menu to move to a recent project, and the current branch and status at the right. The message box is for prompts, with slash commands (`/init`, `/model`, `/review`…), file mentions (`@path` with autocomplete), and a stop button while the agent is running. Inside the box, the session's approval mode sits at the left and its model and reasoning effort at the right, next to the send button. Messages sent during a turn steer the agent.

#### Approvals in the UI — P0
Approval requests appear as cards in the session with the exact command or edit, and Approve / Deny / Always-allow actions. The current approval mode is shown in the composer and can be changed there. A warning appears above the chat only when commands are not sandboxed.

#### Workspace panel — P0
A panel next to the chat, opened and closed from the session header. It starts collapsed. Opened, it shows a Start page with entries for Workspace files, Code review and changes, New terminal and Session log. Choosing an entry opens it as a tab in the Start page's place, each tab has its own close button and a menu to close it, the other tabs or those to its right, a new-tab button brings the Start page back, and closing the panel's last tab collapses the panel, which reopens on the Start page. The panel can be split into two side-by-side panes, each with its own tabs and file tree; tabs can be dragged to reorder them, move them between panes or split a pane, or dragged clear of the panel to float over the page, where they can be moved, resized and sent back. It can also be made fullscreen or collapsed. Each session remembers its panel across reloads, and terminals reconnect to their running shells.
- **File tab:** the file's full path, with a choice of how to show it (rendered Markdown, code with line numbers, plain text, an image with zoom, a PDF, a static HTML page, or a CSV or TSV grid), a reload button, automatic refresh when the file changes, an action to open it in any installed app that handles its type or show it in the file manager, and a toggle for the project file tree beside it. Opening a file that already has a tab selects that tab.
- **Workspace files:** the project's folder and its file tree, listed one folder at a time; choosing a file opens its file tab.
- **Changes:** the changed files and their diffs (see below).
- **Terminal:** an interactive terminal in the project folder, choosing among the installed shells and remembering the choice. Its tab is named after the shell and can be renamed by double-clicking it.
- **Session log:** the session's recorded events, as a raw list or grouped by message.

#### Changed files and diff review — P0
A panel listing every file changed in the session, with unified or side-by-side diffs. The user can revert a single file or all changes, or select lines and send a comment about them to the agent.

#### Git actions — P0
The row above the composer shows the current branch and status. The chat window has no buttons for git changes: the user asks the agent in the chat to create a branch, commit or push.

#### Settings — P0
Appearance (light, dark or following the system), model providers and API keys, default model and effort, default approval mode and sandbox rules, and the GitHub connection, each on its own page. For each provider the user can change the base URL and choose which models to offer, including from the list the provider reports. Each connected provider shows whether its key is good: green after a successful save or a passing key test, red after a failed test. Showing this makes no request to the provider. No provider is configured by default: a session cannot start until the user configures at least one, and the agent makes no model call before then. A key set through the provider's environment variable counts as configured.

#### Typed API — P0
All data exchanged between server and browser is defined once in the backend and generated as TypeScript types for the frontend. CI fails if they drift apart.

#### Onboarding — P1
A first-run guide: check prerequisites, add a model provider, open a project, run a first task.

#### Trajectory view — P1
The session page has three tabs: Chat (the live session view, shown by default), Trajectory and Statistics. Trajectory lists everything that happened in the session as a ledger grouped by turn and step: user messages, model replies, tool calls and their results. Each row shows its kind, a preview, its duration and its token usage. Turns and tool calls can each be folded, and a search box filters the rows. A timeline above the ledger draws each row as a bar from its start to its end, with a model reply split into the wait for its first token and its generation. Dragging across the timeline dims the ledger rows outside that range and scrolls to the rows inside it, and the timeline can be zoomed and panned. Selecting a row opens an inspector beside the ledger with tabs for a Summary, the Payload (the call's arguments), the Result (the structured value and the exact text the model received), the tool's Schema, and Timing (start time and duration), plus a link to the reply that made the call. Long sessions open at their latest rows and load older ones on demand. While the agent runs, the ledger follows new rows until the user scrolls up.

#### Session statistics — P1
The Statistics tab shows one row per turn, which expands into one row per step. Each row shows what started the turn, the tools the step called, context size, output tokens, cache hit rate, time to first token, model time, tool time, output speed and total time, with a bar that splits the total into waiting, generation, tool time and the rest. A totals row covers the whole session even when only part of its history is loaded. Switches show the change in context size since the previous step and choose whether a turn's context is its last step's or the sum of its steps. A figure whose inputs were not recorded shows a dash with the reason instead of an estimate.

#### Pull requests — P1
Open a pull request from the session with a generated title and summary, and see its status.

#### Agent presets — P1
Named combinations of model, effort, approval mode and extra instructions, chosen when starting a session.

#### Browser notifications — P1
Notifications when the agent needs approval, finishes, or fails, so users can work in other tabs.

#### Plugin architecture — P1
Core capabilities — models, tools, sessions, file system, shell — are defined as interfaces with swappable implementations. New model providers, tools or sandbox backends are added as plugins without touching the core.

#### Open in editor — P1
A button that opens the project or a file in the user's own editor, for when they want to change something by hand.

#### Session sharing — P2
Share a read-only live link to a session so a teammate can watch an agent work.

#### Remote execution — P2
Run a project on another machine (over SSH) or in a container instead of locally, with the same UI.

#### Languages — P2
The UI can be translated; English first.

### 6.3 Forge Board (later release)

A kanban workflow added after the Agent and Web UI are stable. It builds on the same agent, sessions and UI. Priorities here apply within the Board release.

| Feature | Description | Priority in Board release |
|---|---|---|
| **Tasks and board** | Tasks with title, description and attachments on a board with columns Backlog, In Progress, In Review, Done, Cancelled; drag-and-drop and filters | Must |
| **Isolated workspaces** | Starting a task creates a git worktree on its own branch, so tasks don't collide with each other or the user's checkout; cleaned up automatically | Must |
| **Parallel tasks** | Several tasks run at once, each with its own agent session, terminal and dev server | Must |
| **Review and merge** | A task's changes are reviewed in the existing diff view; approval opens and can merge a PR | Must |
| **Multiple attempts** | Retry a task with a different model or effort and compare attempts | Should |
| **Subtasks** | Break a task into subtasks manually or by asking the agent | Should |
| **Built-in browser preview** | Embedded preview of the task's dev server with element inspection and device sizes | Should |
| **Pluggable agents** | Drive a workspace with a third-party command-line coding agent through an adapter | Could |
| **Task API (MCP)** | A built-in MCP server so agents can read, create and update tasks | Could |
| **Teams and cloud** | Organizations, members, sign-in, shared boards syncing in real time | Later |
| **More git hosts** | GitLab and Azure Repos in addition to GitHub | Later |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Install** | `npx ingenious-forge` starts the server and opens the browser in under 30 s on a warm cache; nothing else to install besides Node.js and git |
| **Browsers** | Latest two versions of Chrome, Edge, Firefox and Safari; usable on tablet and phone screens |
| **Performance** | Streamed output appears in the UI < 200 ms after the model emits it; a session with thousands of steps scrolls smoothly |
| **Security** | Server listens on `localhost` only unless the user opts in; agent commands run sandboxed; secrets never reach the browser; API keys stored encrypted; destructive git operations require confirmation |
| **Reliability** | Sessions resume after a server restart; the browser reconnects without losing output |
| **Privacy** | All data stays on the user's machine; telemetry is opt-in |
| **Platforms** | macOS, Linux, Windows (WSL acceptable for MVP) |
| **Quality** | Unit and integration tests per module, browser end-to-end tests for core flows, type-drift checks in CI |

## 8. Architecture (first release)

```mermaid
graph TB
    NPX[npx ingenious-forge] -->|starts| API
    NPX -->|opens| Web
    Web[Web UI in the browser<br/>React + TypeScript]
    subgraph Host["Local server (Rust)"]
        API[REST + WebSocket API]
        Proj[Project & session service]
        Agent[Forge Agent<br/>loop, tools, sandbox]
        Git[Git / GitHub service]
        Ev[Event service<br/>live updates]
    end
    DB[(SQLite)]
    Log[(Session logs)]
    LLM[Model providers]

    Web --> API
    API --> Proj & Agent & Git & Ev
    Agent --> LLM
    Agent --> Log
    Proj & Ev --> DB
```

- **Backend:** Rust, with modules `server`, `agent`, `services`, `git`, `db`, `api-types`, `utils`. The Board release adds a `board` service and a worktree manager.
- **Frontend:** React and TypeScript single-page app, served by the local server.
- **Distribution:** one npm package (`ingenious-forge`) that bundles prebuilt server binaries for macOS, Linux and Windows plus the built web UI. The `npx` entry script picks the right binary, starts it and opens the browser. No desktop app is built or shipped.

## 9. Release plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Foundation** | Backend workspace, `npx` launcher, Forge Agent running one session, web chat streaming it | `npx ingenious-forge` opens the browser, and a prompt there edits a file and the diff appears |
| **1 — MVP** | All P0 features (Agent + Web UI) | A user completes a real coding task end to end — prompt, approvals, review, commit, push — without leaving the browser |
| **2 — v1.0** | All P1 features | The team uses Forge daily to build Forge |
| **3 — Forge Board** | Section 6.3 | Several tasks run in parallel in isolated worktrees and end as merged PRs |
| **4 — Cloud** | P2 features and team mode | A team shares projects and boards across machines |

## 10. Success metrics (first release)

| Metric | Target |
|---|---|
| Sessions whose changes the user commits | ≥ 60% |
| Time from `npx ingenious-forge` to first agent response for a new user | < 5 minutes |
| Sessions interrupted by a UI or connection error | < 1% |
| Weekly active users returning the following week | Tracked; trending up each release |

## 11. Risks and open questions

| # | Item | Mitigation / notes |
|---|---|---|
| R1 | Sandboxing on Windows | WSL for MVP |
| R2 | Agent changes that look right but don't work | The terminal in every session makes it quick to run tests before committing |
| R3 | Exposing the server beyond `localhost` by mistake | Off by default; explicit flag plus an access token when enabled |
| Q1 | Final name for the headless command (`forge exec`?) | |
| Q3 | Hosted offering: InGeniousClan-hosted, self-host only, or both | |

## 12. Glossary

| Term | Meaning |
|---|---|
| **Project** | A git repository opened in Forge |
| **Session** | One conversation with the agent in a project, with its full history of messages, tool calls and changes |
| **Turn** | One round of the agent working in response to a message |
| **Step** | One model request within a turn, plus the tool calls it makes |
| **Approval mode** | How much the agent may do without asking the user |
| **Agent preset** | A named set of model, effort, approval mode and instructions |
| **Task** *(Board)* | A unit of work on the board |
| **Workspace** *(Board)* | An isolated git worktree and branch created for a task |
