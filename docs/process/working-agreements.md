# Working agreements for parallel agents

Rules for several agents (and humans) working on Forge at the same time:
how work is claimed, how agents stay out of each other's way, how work is
handed off, and which agent or model is used for which kind of work.

## 1. Claiming work

An agent picks work from the
[project board](https://github.com/users/yokesh-ks/projects/34). The
rules:

- Only pick issues whose Status is **Todo** and whose blocking issues are
  all closed.
- **Claim** means doing all three of the following in a single step:
  1. Assign the issue to the maintainer's GitHub account (agents act as
     the user).
  2. Move the issue to **In Progress** on the project board.
  3. Post a claim comment on the issue (template below).
- One story per agent session; one branch or worktree per story
  (`workspace-setup`).
- Never take an issue that is already **In Progress** unless the claim
  comment is more than 48 hours old **and** the maintainer agrees in chat.

### Claim comment template

```
Claimed by <agent name or session id> on branch `<branch>` at <ISO 8601 date>.
```

Example:

```
Claimed by Claude Code (session abc123) on branch `docs/working-agreements-26` at 2026-10-31.
```

## 2. Avoiding collisions

- Before starting, list the files the story will likely touch (from the
  issue's "Likely areas or files" section, or your own analysis). If
  another **In Progress** issue lists the same files, pick different work
  or ask the maintainer.
- **Shared hot files** — `AGENTS.md`, `NOTICE`, `docs/PRD.md`,
  `.claude/settings.json` — are edited by many stories. When touching
  them:
  - Keep each edit small and focused on your story.
  - Rebase onto `origin/main` often so your diff stays narrow.
  - Never reformat the whole file or reorder unrelated sections.
- **Merge conflicts:** the later PR rebases onto the earlier one. Never
  force-push over someone else's branch.

## 3. Handoff and pausing

When stopping before the work is done, post a **handoff comment** on the
issue so another agent (or the same agent in a new session) can resume.

Move the issue back to **Todo** if the work is being abandoned. Keep it
**In Progress** if it is paused and will be resumed.

### Handoff comment template

```
### Handoff — <ISO 8601 date>

**State:** <one-line summary of what is done>
**Branch:** `<branch name>`
**What's left:**
- <item 1>
- <item 2>

**Last verification:** <pass / fail / not run; include the command if run>
**Open questions:**
- <question, or "None">

**Next step:** <the single next action to take>
```

Example:

```
### Handoff — 2026-10-31

**State:** working-agreements.md written, AGENTS.md summary added.
**Branch:** `docs/working-agreements-26`
**What's left:**
- Comment on issues #9 and #12 referencing claim and closing steps.
- Run CI checks and open a PR.

**Last verification:** `scripts/check-all.sh` passed at commit abc1234.
**Open questions:**
- None

**Next step:** Post comments on #9 and #12, then run checks and open the PR.
```

## 4. Which agent or model for which work

This section applies to Claude Code today. Revisit it when adding other
agents.

| Work | Suggested setup | Why |
|---|---|---|
| Roadmap, PDD design, ADRs, `adhd` | Most capable model, high reasoning effort | Expensive to get wrong |
| Implementation of a clear story | Standard model | Well-specified work |
| `change-review` | A **separate session** from the builder; capable model | Independent context catches more |
| Mechanical chores (labels, links, small docs) | Fast or cheap model | Low risk |

The builder must not review its own work. `change-review` always runs in
a separate session with a clean context (Principle IV).

## 5. Human-in-the-loop points

These gates require the maintainer's explicit approval before proceeding.
They are defined in detail in
[`docs/feature-delivery.md`](../feature-delivery.md) and summarised here:

- **Spec approval:** the PDD design document, before implementation.
- **Design or ADR acceptance:** architecture decision records, before they
  are acted on.
- **PR merge:** the maintainer reviews and merges; agents must not merge
  their own PRs (Principle IV).
- **Release:** every `npm publish`, dist-tag change and GitHub release
  (`release-launch`).
- **Retro action items:** proposed changes from a retrospective, before
  they are applied.

When an issue's acceptance criteria are ambiguous, the agent must:

1. Stop and ask the maintainer, not guess.
2. Add the `needs-decision` label to the issue.
3. Post a comment explaining the ambiguity and the options considered.

## 6. Session hygiene

### Starting a session

1. Read the issue, its parent epic and any existing handoff comment.
2. Run `scripts/setup-dev.sh` if the shared hooks are not active
   (`git config --get core.hooksPath` should return `.githooks`).
3. Use `workspace-setup` to get an isolated branch or worktree and a
   baseline.
4. Claim the issue (section 1 above). `workspace-setup` sets the board
   status to **In Progress**; the claim comment is your responsibility.

### Ending a session

1. Verification evidence has been posted (`verify-before-done`).
2. The board status is correct: **In Review** if a PR is open, **In
   Progress** if paused with a handoff, **Todo** if abandoned.
3. No orphan worktrees: run `git worktree list` and confirm only active
   work has entries. Clean up finished worktrees with
   `git worktree remove`.
4. If pausing, post a handoff comment (section 3 above).
