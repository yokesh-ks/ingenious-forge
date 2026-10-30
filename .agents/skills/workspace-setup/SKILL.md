---
name: workspace-setup
description: Use when about to start implementation, a bug fix, a refactor or any other change work in this repository, before the first edit. Triggers include "implement issue #N", "work on issue #N", "start on <feature>", "fix <bug>", "get set up to …", "create a branch for …", "make a worktree", or noticing that you are on main, on someone else's branch, or in a checkout with uncommitted changes you did not make.
license: MIT
---

# Workspace setup

Give change work its own correctly named branch, and a git worktree when the
checkout is not safe to share, then record a clean baseline before the first
edit. Isolation keeps `main` and other agents' work intact. The baseline
lets you tell new failures from ones that were already there.

**Core rule:** detect before you create. Never nest a worktree, and never
touch changes you did not make.

## When not to use it

- Read-only work: answering questions, reviews, summaries, planning under
  `output/` with no repository edits.
- You are already partway through the task in a workspace this skill (or
  the user) set up; carry on there.
- Forge Board's product worktree manager (PRD §6.3). This skill is for
  developing Forge, not a Forge feature.

## Workflow

### 1. Detect existing isolation

Run from the directory you were started in:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
SUPER=$(git rev-parse --show-superproject-working-tree)
BRANCH=$(git branch --show-current)   # empty means detached HEAD
git status --porcelain
git worktree list
```

- `GIT_DIR` differs from `GIT_COMMON` and `SUPER` is empty: you are already
  in a linked worktree. Do **not** create another one. Report it:
  - on a branch: "Already isolated at `<path>` on branch `<branch>`.";
  - detached HEAD: "Already isolated at `<path>` (detached HEAD, managed
    externally). A branch is needed before finishing."

  Keep the branch you are on, even if its name does not follow step 2: a
  harness or the user chose it. Go to step 5.
- `SUPER` is not empty: you are in a submodule, not a worktree. Treat it
  as a normal checkout.
- Otherwise you are in the main checkout. Continue.

### 2. Name the branch

`<type>/<short-kebab-slug>[-<issue>]`

- `<type>` is one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`,
  matching the conventional commit type the work will use.
- `<short-kebab-slug>` is two to four words from the task title.
- When the work comes from an issue, append its number.

Examples: `feat/forge-exec-stub-42`, `fix/board-column-order-43`,
`chore/adhd-skill-and-license`.

The issue number and title are enough to name the branch. You do not need
to read the issue body to set up the workspace; reading it is part of the
work that follows.

### 3. Fetch the base

```bash
git fetch origin main
```

Branch from `origin/main`, never from the current branch or another
feature branch, unless the user asks for a different base. If the fetch
fails (offline, no remote), say so and ask whether to continue from the
local `main`.

### 4. Choose the isolation

| Situation | Action |
| --- | --- |
| Clean tree, no other agent working in this checkout | Plain branch here: `git switch -c <branch> origin/main`. No consent needed. |
| `git status --porcelain` shows changes you did not make | Propose a worktree and **ask** before creating it. |
| The user says another agent or session is working in this checkout | Propose a worktree and ask. |
| The user asked for a worktree, or `AGENTS.md`/your instructions declare a worktree preference | Create one without asking. |

Never stash, reset, discard, commit or carry over changes you did not make.
If the user declines a worktree on a dirty tree, stop and ask how they
want their changes handled; do not switch branches over them.

Ask in one line, for example:

> The checkout has uncommitted changes (`README.md`, `scratch-notes.txt`)
> that aren't mine. May I create a worktree at
> `.worktrees/fix-board-column-order-43` on a new branch
> `fix/board-column-order-43` from `origin/main`? Your changes stay
> untouched.

**Creating the worktree.** If your agent has its own worktree tool (for
example a worktree command or flag), use it: it manages placement and
cleanup that a manual `git worktree add` would bypass. Otherwise:

```bash
git check-ignore -q .worktrees/ || echo "add .worktrees/ to .gitignore first"
git worktree add .worktrees/<slug> -b <branch> origin/main
cd .worktrees/<slug>
```

`<slug>` is the branch name with `/` replaced by `-`. Keep the trailing
slash in the check: without it Git cannot match the `.worktrees/` pattern
before the directory exists. If `.worktrees/` is not ignored, stop and tell the user rather than creating it. If
`git worktree add` is refused (sandbox or permissions), say so and ask
before working in place.

### 5. Set up the project

Read setup commands from `AGENTS.md` → **Development and validation**; do
not guess them from manifest files. Then check which manifests exist, so you
can say if `AGENTS.md` is missing a step:

| Manifest | Expected setup (only if `AGENTS.md` lists it) |
| --- | --- |
| `Cargo.toml` | `cargo fetch` or `cargo build` |
| `package.json` | install with the package manager `AGENTS.md` names |
| neither | no install step |

If a manifest exists but `AGENTS.md` lists no setup for it, report the gap
instead of inventing a command.

### 6. Record the baseline

Run the validation commands listed in `AGENTS.md` → **Development and
validation** that apply before any change is made (tests, lint, build).
Commands that only apply to files you will change, such as
`validate-sop.sh <file>`, have nothing to check yet: list them as "not
applicable at baseline".

Write `output/scratchpad/<project>/baseline.md` in the workspace, where
`<project>` is the branch slug (the same name `code-assist` will use):

```markdown
# Baseline: <branch>

- Path: <absolute workspace path>
- Branch: <branch> (base origin/main at <full SHA>)
- Date: <ISO 8601>

| Command | Exit code | Result |
| --- | --- | --- |
| <command> | <code> | <pass, or failing items> |

Pre-existing failures: <list, or "none">
```

If `AGENTS.md` lists no applicable checks, the table is replaced by the
sentence "No automated checks exist." Never write that a suite ran or
passed when it did not.

### 7. Report

Tell the user, in this order:

- workspace path and branch;
- base SHA (`git rev-parse origin/main`);
- setup run, or "no setup step";
- baseline summary, plus "Pre-existing failures: …" if there are any;
- the baseline file's path.

If baseline checks fail, ask whether to proceed or investigate first.

### 8. Hand off

Continue with the change work (`agent-sop` `code-assist` or the task
itself). A worktree created here is removed with `git worktree remove` once
its branch is merged or abandoned, and only with the user's agreement.

## Outputs

- A branch named `<type>/<slug>[-<issue>]`, and a worktree under
  `.worktrees/<slug>/` when step 4 called for one.
- `output/scratchpad/<project>/baseline.md` (Git-ignored).

## Common rationalisations

| Excuse | Reality |
| --- | --- |
| "I'm obviously not in a worktree." | Harness worktrees and submodules both fool a glance. Run step 1. |
| "I can't read the issue, so I can't set up." | Number and title name the branch. Set up, then ask about the body. |
| "I'll stash their changes and put them back." | The stash stack is shared and pops go wrong. Use a worktree. |
| "Other branches here use another pattern." | Harness-made branches are not the convention. Use step 2 for new branches. |
| "No tests exist, so there's no baseline." | Write the file and say "No automated checks exist." |
| "Branching from where I am is fine." | Fetch and branch from `origin/main`. |

## Red flags

Stop and go back a step if you notice any of these:

- about to run `git worktree add` without having run step 1;
- about to run `git stash`, `git reset`, `git checkout -- <file>` or
  `git clean` on changes you did not make;
- a branch name without a `<type>/` prefix, or without the issue number
  when there is one;
- a base other than a freshly fetched `origin/main` that the user did not
  ask for;
- editing files before `baseline.md` exists.

## Provenance

Adapted from the `using-git-worktrees` skill in
https://github.com/obra/superpowers, path `skills/using-git-worktrees/`,
commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`, MIT License, Copyright
(c) 2025 Jesse Vincent. See `LICENSE`. Forge kept isolation detection with
the submodule guard, consent before creating a worktree, preferring the
agent's own worktree tool and the clean-baseline step. It added the branch
naming convention, the plain-branch default, the baseline file, and reading
setup and checks from `AGENTS.md` in place of the generic multi-language
setup list.
