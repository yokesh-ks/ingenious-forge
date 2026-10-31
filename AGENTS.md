# Ingenious Forge — Agent Guidance

## Project overview

Ingenious Forge is a web-native coding harness (Forge Agent, web platform and
board). The repository is currently in the planning phase: it holds the
product requirements document and reference research, with no application
code yet.

## Principles

These rules apply to every plan, design and change. Breaking one is a
defect. Each one is worded so that a reviewer can answer "does this change
violate principle N?" with yes or no.

**I. PRD is the source of truth.**
- Every feature MUST trace to a section of `docs/PRD.md`.
- A change that adds, removes or reshapes scope MUST update the PRD first,
  in the same change or an earlier one.
- Forge MUST ship as a web UI launched with `npx ingenious-forge`. Plans
  MUST NOT add a desktop app, terminal UI or editor extension as a delivery
  surface. `forge exec` stays only as a headless entry point for automation.

*Reason:* one document settles scope arguments, so work does not drift.

**II. Spec before code.**
- Application code MUST NOT be written without an approved spec and plan:
  `pdd` output under `output/planning/` or a GitHub issue that states the
  steps and acceptance criteria.

*Reason:* design mistakes cost less to fix in a plan than in code.

**III. Evidence over claims.**
- An agent MUST NOT report work as done, fixed or passing without showing
  the command output that proves it.
- When no check exists or one was skipped, the report MUST say so.

*Reason:* a claim without output cannot be reviewed. This rule governs how
agents work on this repository. It is not a Forge product feature (see VII).

**IV. Humans own the gates.**
- Spec approval, design approval, merges and amendments to these principles
  MUST be decided by the maintainer. An agent MUST NOT approve or merge its
  own work.

*Reason:* accountability for what ships stays with a person.

**V. Open by default.**
- Forge's own code and docs MUST be licensed under Apache 2.0 (`LICENSE`,
  `NOTICE`).
- Third-party material MUST keep its own license file beside it and MUST be
  recorded in `NOTICE`. Material that only borrows an idea, with no copied
  text or code, needs neither.

*Reason:* anyone can reuse Forge, and every borrowed piece stays traceable.

**VI. Agent-agnostic tooling.**
- Project skills and workflows MUST live in `.agents/skills/` and MUST work
  for any coding agent that reads `AGENTS.md`.
- Tool-specific wiring MUST be limited to symlinks or config files (such as
  `.claude/skills/` and `CLAUDE.md`) that hold no rules of their own.

*Reason:* contributors can use whichever coding agent they prefer.

**VII. Forge speaks for itself.**
- Product docs (`docs/PRD.md`, `README.md` and any future product page)
  MUST describe Forge's own features and MUST NOT name competing products.
  Use "third-party CLI agents" for external agents.
- Product docs MUST NOT describe a verification gate, evidence reports or a
  "verification-first" positioning.
- Commits, PRs, issues, docs and code MUST NOT carry AI attribution: no
  `Co-Authored-By` trailers for an AI, no "Generated with" lines, no
  "Assisted by the code-assist SOP" footer, and no AI listed as author or
  owner. This holds even where an SOP or tool suggests otherwise.

*Reason:* the product is presented on its own terms, and the maintainer is
the author of record.

**VIII. Simplicity first.**
- A change MUST NOT add a language, service, datastore or runtime
  dependency beyond what `docs/PRD.md` §8 names, unless its plan records
  the simpler option considered and why it falls short.
- A change SHOULD NOT add code, config or docs that no current PRD
  requirement uses.

*Reason:* every extra part is one more thing to build, explain and keep
working.

### Governance

- Principles take precedence over every other section of this file and
  over any skill or SOP. Where they conflict, the principle wins until it
  is amended.
- An amendment goes in its own commit titled `docs(principles): <change>`.
  The commit body states the version bump and the reason.
- Versioning follows semver: MAJOR when a principle is removed or
  redefined, MINOR when one is added or materially expanded, PATCH for
  wording. Dates are ISO 8601.

**Version** 1.0.0 · **Ratified** 2026-10-30 · **Last amended** 2026-10-30

## Repository layout

- `docs/PRD.md`: product requirements document — the source of truth for
  scope and features.
- `docs/reference/<project>/`: generated reference documentation for studied
  coding-agent projects, one markdown file per page.
- `docs/process/`: how Forge is built: the project board
  (`project-board.md`).
- `docs/decisions/`: architecture decision records (`NNNN-kebab-title.md`)
  and their index in `README.md`. Managed with `decision-records`.
- `scripts/generate-docs.mjs`: writes `.docs-input/pages.json` into
  markdown pages under `docs/reference/`. The output folder is hard-coded in
  `OUTPUT_DIR`; update it before generating a new reference set.
- `.github/labels.json` and `scripts/sync-labels.mjs`: the GitHub label
  set as code and the script that syncs it (see "Issue tracking").
- `.github/ISSUE_TEMPLATE/`: issue forms for epics, stories, bugs and
  chores (see "Issue tracking").
- `.githooks/`: shared git hooks, their check library and AI attribution
  patterns; `scripts/setup-dev.sh` enables them and `scripts/test-hooks.sh`
  tests them (see "Development and validation").
- `.github/workflows/repo-hygiene.yml` and `scripts/check-*`: the CI
  repo-hygiene checks and the scripts they run; `scripts/check-all.sh`
  runs them locally (see "Continuous integration").
- `.github/prd-banned-names.txt`: competing product names that
  `docs/PRD.md` must not contain (Principle VII).
- `tools/clean-mark/`: local Node tool for converting web pages to clean
  markdown.
- `.docs-input/`: Git-ignored scratch input for `generate-docs.mjs`.
- `.agents/skills/`: project skills shared by all agents.
  `.claude/skills/` holds symlinks to them for Claude Code.
  - `agent-sop/`: structured SOP workflows for change work and planning.
  - `adhd/`: parallel divergent ideation, vendored from
    https://github.com/UditAkhourii/adhd (MIT, see its `LICENSE`).
  - `skill-intake/`: the standard way to add, adapt, vendor or check a
    project skill, adapted from https://github.com/obra/superpowers (MIT,
    see its `LICENSE`).
  - `workspace-setup/`: gives change work an isolated, correctly named
    branch (or worktree) and records a baseline before the first edit,
    adapted from https://github.com/obra/superpowers (MIT, see its
    `LICENSE`).
  - `decision-records/`: write, supersede and index architecture decision
    records in `docs/decisions/`, adapted from
    https://github.com/addyosmani/agent-skills (MIT, see its `LICENSE`).
  - `roadmap-planning/`: turns `docs/PRD.md` into milestones, epics and
    stories on the GitHub project board, keeps `docs/ROADMAP.md` in sync
    and re-plans after PRD changes, adapted from
    https://github.com/addyosmani/agent-skills (MIT, see its `LICENSE`).
  - `plan-analysis/`: checks a feature's story, `pdd` design and plan,
    code tasks, ADRs and principles for gaps and conflicts before
    building, and lists the remaining work as new tasks after building,
    adapted from https://github.com/github/spec-kit (MIT, see its
    `LICENSE`).
  - `verify-before-done/`: no claim that work is done, fixed or passing
    without fresh command output, compared with the `workspace-setup`
    baseline and the acceptance criteria, adapted from
    https://github.com/obra/superpowers (MIT, see its `LICENSE`).
  - `change-review/`: two-sided review skill — request mode dispatches an
    independent reviewer subagent with a clean context; receive mode
    evaluates and responds to incoming feedback with technical rigor,
    adapted from https://github.com/obra/superpowers (MIT, see its
    `LICENSE`).

  To add, adapt or vendor a skill, use `skill-intake`. It places the skill
  in `.agents/skills/<name>/`, links it with
  `ln -s ../../.agents/skills/<name> .claude/skills/<name>`, and records
  its licence in `NOTICE` and its purpose here.

## Front door

For any meaningful engineering request, start with front-door triage:

- **Change work**: Use `agent-sop` for implementation, bug fixing,
  refactoring, or changes to architecture, tests, or QA expectations. Select
  the appropriate workflow: `codebase-summary`, `pdd`,
  `code-task-generator`, or `code-assist`. Before the first edit, use
  `workspace-setup` to get a branch, or a worktree, and a baseline.
- **Roadmap**: Use `roadmap-planning` to decide what to build first or
  next, break the PRD or an epic into issues on the project board, replan
  after a PRD change, or report progress. It picks the feature; `pdd`
  designs it.
- **Product planning**: Use the `pdd` workflow of `agent-sop` to turn a
  feature idea into a design and implementation plan. Ground it in
  `docs/PRD.md`.
- **Ideation**: Use `adhd` for open-ended, high-stakes decisions such as
  architecture, naming, API surface, or fuzzy debugging, or when the user
  asks for `/adhd` or brainstorming. Its pre-flight gate decides whether a
  direct answer is better. Feed its shortlist into `pdd` when it leads to
  a feature.
- **Decisions**: Use `decision-records` when a significant technical
  choice is made, changed or needs justifying under Principle VIII. Its
  gate turns away choices that are cheap to reverse.
- **Plan check**: Use `plan-analysis` after `code-task-generator` and
  before `code-assist`, to check a feature's planning documents against
  each other and the principles; use its converge mode after building to
  list what is still missing.
- **Completion claims**: Use `verify-before-done` before saying work is
  done, fixed or passing, before committing, opening a PR or closing an
  issue, and before calling a failure pre-existing.
- **Review work**: Use `change-review` to request an independent review of
  a change (request mode) or to respond to incoming feedback (receive mode).
  Prioritize consistency with `docs/PRD.md` and Principles before
  correctness; human approval on the PR is the final gate (Principle IV).
- **All other requests**: Use normal conversational or investigative behavior
  without forcing an SOP workflow.

If the request is ambiguous, ask one concise clarification.

## Development and validation

There is no build or lint setup yet; the only tests are the git hook
tests and the repo-hygiene checks below. Do not claim a test suite ran
unless one is introduced or an explicit test command is supplied.

Run `scripts/setup-dev.sh` once after cloning. It enables the shared git
hooks in `.githooks/` (`git config core.hooksPath .githooks`), which apply
to every committer, human or agent:

- `commit-msg` requires a conventional title,
  `type(scope)?: subject` with `type` one of `feat`, `fix`, `docs`,
  `chore`, `refactor`, `test`, `build`, `ci`, `perf` or `revert`, a
  subject of at most 72 characters and no trailing period. Git's own
  `Merge`, `Revert`, `fixup!`, `squash!` and `amend!` titles pass. It
  rejects AI attribution (Principle VII); human `Co-Authored-By` lines
  pass.
- `pre-commit` blocks commits on `main` and `master`, staged secret files
  (`.env`, `*.pem`, `id_rsa` and similar) and files over 5 MB, and a new
  skill in `.agents/skills/` whose `.claude/skills/` symlink is not
  staged. The maintainer can commit on `main` with `FORGE_ALLOW_MAIN=1`.

The checks live in `.githooks/lib/checks.sh` and the attribution patterns
in `.githooks/ai-attribution-patterns.txt`, so CI can source the same
code. Change checks and patterns there only.

- `scripts/check-all.sh` — run every CI check locally (see "Continuous
  integration"). Run it before reporting work as done.
- `scripts/test-hooks.sh` — test the git hooks against sample commit
  messages and commits in a throwaway repository.
- `node scripts/generate-docs.mjs` — regenerate a reference doc set from
  `.docs-input/pages.json`.
- `.agents/skills/agent-sop/scripts/validate-sop.sh <file.sop.md>` — validate the
  structure of a new or edited SOP.
- `node scripts/sync-labels.mjs` — compare GitHub labels with
  `.github/labels.json` (dry run). Add `--apply` to create and update
  labels, and `--prune` to list labels not in the file; deleting them
  needs `--apply --prune --yes` and the maintainer's approval.
- `bash .agents/skills/skill-intake/scripts/check-skill.sh [<name>]` —
  check a project skill's name, frontmatter, symlink, licence, `NOTICE`
  entry and `AGENTS.md` registration (all skills when no name is given).

Before claiming success, follow `verify-before-done`: read
`.agents/skills/verify-before-done/SKILL.md` before saying work is done,
fixed or passing, writing a status line, PR body or closing comment, or
saying a failure is pre-existing.

### Continuous integration

`.github/workflows/repo-hygiene.yml` runs on every pull request (opened,
synchronize, edited, reopened, labeled, unlabeled) and every push to
`main`. Local hooks can be skipped; CI cannot. Each job is a separate
status check with a stable name, and each runs one script, so
`scripts/check-all.sh` checks the same things locally (it skips
`pr-body`, which needs a pull request):

| Check | Script | Fails when |
| --- | --- | --- |
| `commits` | `scripts/check-commits.sh [<range>]` | a commit in the PR (or push) has a non-conventional title or AI attribution; names each SHA |
| `pr-body` | `scripts/check-pr-body.sh <title> <body-file> [<labels>]` | the PR title is not conventional, the body has AI attribution, or the body links no issue (`Closes`, `Fixes`, `Resolves` or `Refs #N`); a PR with the `chore` label and a `chore:` or `docs:` title needs no issue |
| `skills` | `scripts/check-skills.sh` | a skill in `.agents/skills/` fails `skill-intake`'s `check-skill.sh`: frontmatter, `.claude/skills/` symlink, `LICENSE` and `NOTICE` for a `license:` field, or the bullet in this file |
| `sop` | `scripts/check-sop.sh` | a tracked `*.sop.md` or an `agent-sop/references/*.md` SOP fails `validate-sop.sh` |
| `notice` | `scripts/check-notice.sh` | a `docs/reference/<project>/` has no `LICENSE` or is not listed in `docs/reference/README.md` |
| `links` | `node scripts/check-links.mjs` | a relative link in `AGENTS.md`, `README.md`, `docs/**` (except `docs/reference/`) or `.agents/skills/**` points at a missing file |
| `prd-names` | `scripts/check-prd-names.sh` | `docs/PRD.md` contains a name from `.github/prd-banned-names.txt` |

`validate-sop.sh` rejects any file not named `*.sop.md`, but the agent-sop
references follow the same structure, so `check-sop.sh` validates each
one as a temporary `*.sop.md` copy. The workflow pins third-party actions
to a full commit SHA and grants only `contents: read` (plus
`pull-requests: read` for `pr-body`). Put new check logic in `scripts/`,
not in the workflow file.

## Issue tracking

Labels are defined in [`.github/labels.json`](.github/labels.json); each
description says when to apply the label. Use only these labels, and add
new ones to the file first, then sync.

- **Type**, exactly one: `epic`, `story`, `bug`, `chore`.
- **Area**, one or more: `area:agent`, `area:web-ui`, `area:board`,
  `area:server`, `area:launcher`, `area:skills`, `area:process`,
  `area:docs`.
- **Priority**, stories and bugs: `P0`, `P1`, `P2`, as in PRD §6.
- **Size**, stories: `size:XS`, `size:S`, `size:M`, `size:L` (`L` means
  split it first).
- **Flags**: `blocked`, `stale`, `needs-decision`, `good first issue`,
  `help wanted`.

Issues are filed through the forms in
[`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/): Epic, Story, Bug
and Chore. Each form applies its type label; triage applies area,
priority and size labels and the milestone. Blank issues are disabled.

Agents creating issues via `gh` must use the same headings as
`.github/ISSUE_TEMPLATE/*.yml`: each field's `label` becomes a
`### <label>` heading, in the form's order, and the issue gets the
form's type label. Write the body to a file and pass `--body-file`.
For epics and stories, use the `roadmap-planning` templates, which
follow the forms.

Every issue and PR is tracked on the
[IngeniousForge project board](https://github.com/users/yokesh-ks/projects/34).
[`docs/process/project-board.md`](docs/process/project-board.md) holds
its fields, views, workflows, ids and the `gh` commands to update it.
Status moves in this order:

- **Backlog**: captured, not yet planned or refined; set when an item is
  added.
- **Todo**: refined and ready to start, dependencies met.
- **In Progress**: claimed; the agent assigns itself and sets this at
  `workspace-setup`.
- **In Review**: a PR is open and waits for review and the maintainer.
- **Done**: merged or closed.

## Conventions

Licensing, product wording and attribution rules are in Principles V and
VII. Conventions here cover how those rules are applied:

- A vendored skill keeps its `LICENSE` inside its own folder under
  `.agents/skills/`.
- Each `docs/reference/<project>/` keeps the project's `LICENSE` and is
  listed in `docs/reference/README.md`.
- Branches are named `<type>/<short-kebab-slug>[-<issue>]`, where `<type>`
  is one of `feat`, `fix`, `docs`, `chore`, `refactor` or `test`, and the
  issue number is appended when the work comes from an issue (for example
  `feat/forge-exec-stub-42`). Branch from an up-to-date `origin/main`.
- Git worktrees made by hand go in `.worktrees/<slug>/` at the repository
  root, which is Git-ignored.

## Agent SOP outputs

Treat `output/` as transient workflow material. It is Git-ignored and must
not contain source-controlled project documentation:

- `output/summary/` — repository summaries and generated documentation.
- `output/planning/{project_name}/` — PDD research, design, and plans.
- `output/tasks/{project_name}/` — generated code task files.
- `output/scratchpad/{project_name}/` — code-assist working notes.

## Custom Instructions
<!-- Human- or agent-maintained conventions. Preserved by codebase-summary. -->
