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
- `docs/decisions/`: architecture decision records (`NNNN-kebab-title.md`)
  and their index in `README.md`. Managed with `decision-records`.
- `scripts/generate-docs.mjs`: writes `.docs-input/pages.json` into
  markdown pages under `docs/reference/`. The output folder is hard-coded in
  `OUTPUT_DIR`; update it before generating a new reference set.
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
  - `roadmap-planning/`: turns `docs/PRD.md` into milestones, epics and
    stories on the GitHub project board, keeps `docs/ROADMAP.md` in sync
    and re-plans after PRD changes, adapted from
    https://github.com/addyosmani/agent-skills (MIT, see its `LICENSE`).

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
  `code-task-generator`, or `code-assist`.
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
- **Review work**: Start review-first; prioritize consistency with
  `docs/PRD.md` and missing validation.
- **All other requests**: Use normal conversational or investigative behavior
  without forcing an SOP workflow.

If the request is ambiguous, ask one concise clarification.

## Development and validation

There is no build, lint, or test setup yet. Do not claim a test suite ran
unless one is introduced or an explicit test command is supplied.

- `node scripts/generate-docs.mjs` — regenerate a reference doc set from
  `.docs-input/pages.json`.
- `.agents/skills/agent-sop/scripts/validate-sop.sh <file.sop.md>` — validate the
  structure of a new or edited SOP.

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
