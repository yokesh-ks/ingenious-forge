# Claude Code pre-execution hooks

Claude Code hooks that catch process violations **before** a command runs,
so the agent corrects itself immediately instead of failing at the git hook
or in CI. They are an optional layer on top of the git hooks (B1) and the
permission deny rules (B3), which remain the actual enforcement.

## Overview

| Hook | Event | Script | Blocking? |
| --- | --- | --- | --- |
| Commit guard | `PreToolUse` (Bash) | `.claude/hooks/commit-guard.sh` | Yes (deny) |
| Main-branch guard | `PreToolUse` (Bash) | `.claude/hooks/main-guard.sh` | Yes (deny) |
| Bypass guard | `PreToolUse` (Bash) | `.claude/hooks/bypass-guard.sh` | Yes (deny) |
| Verify nudge | `Stop` | `.claude/hooks/verify-nudge.sh` | No (advisory) |

All hooks **fail open**: if they cannot parse the command, find `jq`, or
read a required file, they exit without blocking and log the reason to
stderr. Enforcement still happens in the git hooks and CI.

## Hook details

### Commit guard

**Trigger:** `git commit`, `gh pr create`, `gh pr edit`.

**What it checks:** Runs the shared `forge_attribution_hits` function from
`.githooks/lib/checks.sh` against the full command text. Any match on the
patterns in `.githooks/ai-attribution-patterns.txt` triggers a deny.

**Deny message example:**

```
AI attribution blocked (AGENTS.md Principle VII). Remove these lines:
  > Co-Authored-By: Claude <noreply@anthropic.com>
```

**`if` conditions:** `Bash(git commit *)`, `Bash(gh pr create *)`,
`Bash(gh pr edit *)`.

### Main-branch guard

**Trigger:** `git commit`, `git push`.

**What it checks:** Reads the current branch with
`git symbolic-ref --short HEAD`. If the branch is `main` or `master`, it
denies the command.

**Deny message example:**

```
Working on 'main' is blocked. Use workspace-setup to create a branch
(see .agents/skills/workspace-setup/).
```

**`if` conditions:** `Bash(git commit *)`, `Bash(git push *)`.

### Bypass guard

**Trigger:** any Bash command containing `--no-verify`,
`-c core.hooksPath=`, or `-n` on `git commit`.

**What it checks:** Pattern-matches the command text for hook-bypass
flags. Overlaps the permission deny rules in `.claude/settings.json` but
gives a clearer, contextual message.

**Deny message example:**

```
--no-verify skips the project's git hooks. Remove it; the hooks enforce
commit conventions and attribution rules (AGENTS.md Principle VII).
```

**`if` conditions:** `Bash(*--no-verify*)`, `Bash(*-c core.hooksPath=*)`,
`Bash(git commit *-n)`, `Bash(git commit *-n *)`.

### Verify nudge (Stop hook)

**Trigger:** the agent is about to stop (end of turn).

**What it checks:** If `git diff` shows uncommitted changes to tracked
files **and** the session transcript contains no verification command
(`scripts/check-all.sh`, `verify-before-done`, `validate-sop.sh`,
`test-hooks.sh`, or individual `check-*.sh` scripts), it outputs an
advisory reminder.

**Advisory message:**

```
Files were modified but no verification command ran. Run
scripts/check-all.sh or invoke verify-before-done before claiming
completion.
```

**Never blocks.** The script never exits 2, so the agent can always stop.
The reminder is delivered via `hookSpecificOutput.additionalContext`.

## Configuration

The hooks are registered in `.claude/settings.json` under the `hooks` key.
Each `PreToolUse` entry uses an `if` condition to filter which Bash
commands trigger it, and all scripts use `${CLAUDE_PROJECT_DIR}` so they
resolve correctly regardless of the working directory.

## Dependencies

- **`jq`** — all hook scripts use it to parse the JSON input from stdin
  and to produce JSON output. If `jq` is not found, the hook fails open.
- **`.githooks/lib/checks.sh`** — the commit guard sources this library
  for `forge_attribution_hits`. The pattern file
  `.githooks/ai-attribution-patterns.txt` is read through it.

## Porting to another agent

Each hook can be reimplemented for any coding agent that supports
pre-execution hooks. The table below lists the trigger, input and decision
for each hook.

| Hook | Trigger | Input | Decision |
| --- | --- | --- | --- |
| Commit guard | Before running a shell command that starts with `git commit`, `gh pr create` or `gh pr edit` | The full command string | **Block** if `forge_attribution_hits` (from `.githooks/lib/checks.sh`) returns any matches against the command text. Report the matched lines. |
| Main-branch guard | Before running a shell command that starts with `git commit` or `git push` | The current git branch (`git symbolic-ref --short HEAD`) | **Block** if the branch is `main` or `master`. Suggest `workspace-setup`. |
| Bypass guard | Before running a shell command containing `--no-verify`, `-c core.hooksPath=`, or `-n` on a `git commit` | The full command string | **Block** unconditionally (the trigger conditions are the violation). Explain why the flag is not allowed. |
| Verify nudge | When the agent is about to finish / stop | Git diff status and the session transcript (or equivalent log of commands run) | **Advisory only** (never block). If tracked files have uncommitted changes and no verification command ran during the session, remind the agent to run `scripts/check-all.sh` or `verify-before-done`. |

### Reimplementation notes

1. The commit guard **must** call `forge_attribution_hits` from
   `.githooks/lib/checks.sh` (or source the function directly). Do not
   duplicate the pattern list — it is maintained in
   `.githooks/ai-attribution-patterns.txt`.
2. All hooks must fail open: if they cannot parse input or a dependency is
   missing, they must allow the command and log a warning.
3. The verify nudge must never block the agent from stopping, to avoid
   infinite loops.
