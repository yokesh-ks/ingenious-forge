# Agent adapters

How Forge stays agent-agnostic while keeping Claude Code fully wired as the
primary agent currently. Principle VI requires that rules and skills live in
agent-neutral locations; each agent gets only a thin adapter that points at
them.

## Layers

| Layer | Single source (agent-agnostic) | Claude Code adapter | Other agents (later) |
|---|---|---|---|
| Rules and context | `AGENTS.md` | `CLAUDE.md` contains only `@AGENTS.md` | Native `AGENTS.md` reading, or a one-line pointer file |
| Skills | `.agents/skills/<name>/` | `.claude/skills/<name>` symlinks | That agent's skill or command discovery, linking to the same folders |
| Permissions | [`docs/process/agent-permissions.md`](agent-permissions.md) | `.claude/settings.json` | Map each policy row to the agent's config (see the checklist in `agent-permissions.md` § "Implementing for another agent") |
| Hard enforcement | Git hooks (`.githooks/`), CI (`.github/workflows/`), GitHub ruleset | Automatic — no adapter needed | Automatic — no adapter needed |
| Memory and learning | `AGENTS.md`, skills, `docs/decisions/` | Claude Code auto-memory for personal preferences only; project-relevant knowledge is promoted into `AGENTS.md` or a skill | Same rule: no project rules in agent-local storage |

## Add-an-agent checklist

Follow this checklist when wiring a new coding agent to the repository.
Each item must pass before the agent is considered ready.

- [ ] **Rules loaded.** The agent reads `AGENTS.md` at session start. If
  it cannot follow an `@AGENTS.md` include, copy the one-line pointer into
  its equivalent of `CLAUDE.md`, or configure it to read `AGENTS.md`
  directly.
- [ ] **Skills discoverable.** The agent can find and read every
  `SKILL.md` under `.agents/skills/`. Create adapter symlinks or
  configuration in the agent's skill directory (as `.claude/skills/` does
  for Claude Code).
- [ ] **Permission policy mapped.** Map every row of
  [`docs/process/agent-permissions.md`](agent-permissions.md) to the
  agent's permission or sandbox configuration, following its
  "Implementing for another agent" section. Commit the config so it is
  shared.
- [ ] **Git hooks active.** Run `scripts/setup-dev.sh`. The shared hooks
  in `.githooks/` enforce commit conventions and block secrets regardless
  of which agent commits.
- [ ] **Commits pass CI.** Make a test commit on a branch, push and
  confirm every CI check in `.github/workflows/repo-hygiene.yml` passes.
- [ ] **Portability spot-check.** Start a session with only `AGENTS.md`
  and `.agents/skills/` available (no agent-specific config). Ask "what
  are this repo's rules and conventions?" The answer must be complete from
  `AGENTS.md` alone.
- [ ] **Skill portability.** For each skill that documents an
  "Agent portability" fallback, confirm the agent can follow either the
  primary path or the fallback.
- [ ] **No agent-specific rules escaped.** Grep the agent's config
  directory for project rules that are not in `AGENTS.md` or a skill.
  Move any that are found.

## Claude Code — completed checklist

| Item | Status | Evidence |
|---|---|---|
| Rules loaded | Done | `CLAUDE.md` contains only `@AGENTS.md` |
| Skills discoverable | Done | `.claude/skills/` holds symlinks for every skill in `.agents/skills/` |
| Permission policy mapped | Done | `.claude/settings.json` implements `docs/process/agent-permissions.md`; gaps documented in that file |
| Git hooks active | Done | `scripts/setup-dev.sh` sets `core.hooksPath` to `.githooks` |
| Commits pass CI | Done | Every PR runs `.github/workflows/repo-hygiene.yml` |
| Portability spot-check | Done | `AGENTS.md` § Development and validation covers commit rules, hook behaviour and CI checks |
| Skill portability | Done | `adhd`, `change-review` and `verify-before-done` document fallbacks for subagent spawning |
| No agent-specific rules escaped | Done | Claude Code auto-memory holds personal preferences only; all project rules are in `AGENTS.md` Principles and Conventions |

## Skill metadata

Skills do not require per-agent metadata files by default. Add an
`agents/<agent>.yaml` (as `agent-sop/agents/` already does) only when an
agent needs configuration that cannot be expressed in `SKILL.md` itself,
such as tool mappings or prompt rewrites. The `skill-intake` portability
rule covers the common case: document a fallback in the skill body.

## Known agents — starting points

These are agents commonly used for coding today. The entries are
**unverified until someone runs the checklist above with that agent**.
They are a starting point for the adapter, not a commitment.

| Agent | Reads instructions from | Skill discovery | Permission config | Notes |
|---|---|---|---|---|
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | `.claude/skills/` symlinks | `.claude/settings.json` | Primary agent; fully wired |
| Cursor | `.cursor/rules/*.mdc`, project `.cursorrules` | `.cursor/rules/` or includes | Settings / `.cursor/` config | Would need a pointer to `AGENTS.md` in its rules |
| Windsurf (Codeium) | `.windsurfrules`, workspace rules | Cascade memories, workspace rules | Built-in sandbox | Would need a pointer to `AGENTS.md` |
| Aider | `.aider.conf.yml`, conventions file | Reads files on request | No built-in permission system | Would need the conventions file to point at `AGENTS.md` |
| Codex (OpenAI) | `AGENTS.md` natively | `agents/` or configured paths | Sandbox + approval config | May read `AGENTS.md` directly; skill paths need mapping |
| GitHub Copilot (agent mode) | `.github/copilot-instructions.md` | Custom instructions, MCP | Org policies | Would need instructions to point at `AGENTS.md` |
