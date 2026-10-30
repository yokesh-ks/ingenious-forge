# Ingenious Forge — Agent Guidance

## Project overview

Ingenious Forge is a web-native coding harness (Forge Agent, web platform and
board). The repository is currently in the planning phase: it holds the
product requirements document and reference research, with no application
code yet.

## Repository layout

- `docs/PRD.md`: product requirements document — the source of truth for
  scope and features.
- `docs/reference/<project>/`: generated reference documentation for studied
  coding-agent projects, one markdown file per page.
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

  To add a skill, place it in `.agents/skills/<name>/` and link it with
  `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.

## Front door

For any meaningful engineering request, start with front-door triage:

- **Change work**: Use `agent-sop` for implementation, bug fixing,
  refactoring, or changes to architecture, tests, or QA expectations. Select
  the appropriate workflow: `codebase-summary`, `pdd`,
  `code-task-generator`, or `code-assist`.
- **Product planning**: Use the `pdd` workflow of `agent-sop` to turn a
  feature idea into a design and implementation plan. Ground it in
  `docs/PRD.md`.
- **Ideation**: Use `adhd` for open-ended, high-stakes decisions such as
  architecture, naming, API surface, or fuzzy debugging, or when the user
  asks for `/adhd` or brainstorming. Its pre-flight gate decides whether a
  direct answer is better. Feed its shortlist into `pdd` when it leads to
  a feature.
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

- Product docs describe Forge's own features only; do not name competing
  products in `docs/PRD.md`.
- Commits and PRs carry no AI attribution: no `Co-Authored-By` trailers, no
  "Generated with" lines, and no "Assisted by the code-assist SOP" footer,
  even where an SOP suggests one.

## Agent SOP outputs

Treat `output/` as transient workflow material. It is Git-ignored and must
not contain source-controlled project documentation:

- `output/summary/` — repository summaries and generated documentation.
- `output/planning/{project_name}/` — PDD research, design, and plans.
- `output/tasks/{project_name}/` — generated code task files.
- `output/scratchpad/{project_name}/` — code-assist working notes.

## Custom Instructions
<!-- Human- or agent-maintained conventions. Preserved by codebase-summary. -->
