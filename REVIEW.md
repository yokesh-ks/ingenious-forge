# Review Guidance

Repository-specific guidance for reviewing changes to Ingenious Forge.
Reviewers load this file from the base branch, so a change cannot rewrite
the rules it is reviewed against.

The principles in `AGENTS.md` are the standard. A change that breaks one is
a defect, not a style note. Report each finding with the file, the line and
the principle or PRD section it breaks.

## Priorities

Review in this order and report findings most severe first:

1. **Principle violations.** Any "yes" to the checklist below.
2. **PRD consistency.** Scope that does not trace to `docs/PRD.md`.
3. **Correctness.** Bugs in scripts, tools and skills.
4. **Missing validation.** Claims or changes with no check behind them.
5. **Simplification.** Code, config or docs that no current requirement uses.

Skip formatting and wording preferences unless they change meaning.

Do not raise a finding again on a later push when the maintainer already
answered its thread with "No change: <reason>" and the lines it concerns
have not changed. Disagree in that thread instead.

## Principle checklist

Answer each question yes or no for the change under review.

Principles I and II govern the Forge product. Development-process tooling
(skills, git and agent hooks, CI, `scripts/`, `docs/process/`) traces to a
GitHub issue instead of a PRD section; do not report it under I or II.

**I. PRD is the source of truth**
- Does a feature lack a matching section in `docs/PRD.md`?
- Does the change add, remove or reshape scope without updating the PRD in
  the same or an earlier change?
- Does a plan add a desktop app, terminal UI or editor extension as a
  delivery surface? (`forge exec` as a headless entry point is allowed.)

**II. Spec before code**
- Does the change add application code without an approved `pdd` plan or a
  GitHub issue that states the steps and acceptance criteria? Ask for the
  link if it is not in the description.

**III. Evidence over claims**
- Does the description say something is done, fixed or passing without the
  command output that proves it?
- Was a check skipped or unavailable without the description saying so?
  There is no build, lint or test suite yet; a claim that one ran is a
  finding.

**IV. Humans own the gates**
- Did an agent approve or merge its own work, approve a spec or design, or
  amend the principles?

**V. Open by default**
- Does new Forge code or documentation fall outside Apache 2.0?
- Does copied third-party text or code lack its own `LICENSE` beside it or
  an entry in `NOTICE`?
- Does a new `docs/reference/<project>/` lack its `LICENSE` or a line in
  `docs/reference/README.md`?

**VI. Agent-agnostic tooling**
- Is a skill or workflow placed anywhere other than `.agents/skills/`?
- Does `.claude/skills/`, `CLAUDE.md` or another tool-specific file hold
  rules of its own instead of a symlink or pointer?
- Does a skill depend on one coding agent's features without a fallback?

**VII. Forge speaks for itself**
- Do `docs/PRD.md`, `README.md` or a product page name a competing product
  instead of "third-party CLI agents"? (`docs/reference/` is research, not
  product docs, and may name the projects it studies.)
- Do product docs describe a verification gate, evidence reports or a
  "verification-first" positioning?
- Does any commit, PR, issue, doc or code carry AI attribution, such as a
  `Co-Authored-By` trailer for an AI, a "Generated with" line or an AI
  listed as author or owner?

**VIII. Simplicity first**
- Does the change add a language, service, datastore or runtime dependency
  beyond PRD §8 (Rust backend, React and TypeScript frontend, SQLite, one
  npm package) without a plan that records the simpler option considered?
- Does it add code, config or docs that no current PRD requirement uses?

## Area-specific checks

**`docs/PRD.md`**
- Feature entries keep a priority tag (P0, P1, P2) and sit under the right
  section of §6.
- §3 goals and non-goals, §8 architecture and §9 release plan still agree
  with the changed feature list.

**`AGENTS.md` principles**
- An amendment is in its own commit titled `docs(principles): <change>`,
  and the body states the semver bump and the reason.
- The version line and the "Last amended" date (ISO 8601) are updated.

**`.agents/skills/`**
- A new or changed skill went through `skill-intake`: it lives in
  `.agents/skills/<name>/`, has a symlink at `.claude/skills/<name>`, and
  is listed in `AGENTS.md` with its purpose.
- A vendored skill keeps its upstream `LICENSE` in its own folder and is
  recorded in `NOTICE`.
- A new or edited SOP passes
  `.agents/skills/agent-sop/scripts/validate-sop.sh <file.sop.md>`, and the
  description shows the output.

**`scripts/` and `tools/`**
- `scripts/generate-docs.mjs` does not commit an `OUTPUT_DIR` that points
  at a reference set other than the one the change adds.
- Generated reference pages come from `.docs-input/pages.json` and are not
  hand-edited.

**Git-ignored paths**
- Nothing under `output/` or `.docs-input/` is committed.
- Project documentation is not placed under `output/`.

## Commits and PRs

- Commit titles follow Conventional Commits, as in the existing history
  (`feat(skills): ...`, `docs: ...`, `chore: ...`).
- One logical change per commit. Principle amendments are never bundled
  with other work.
- The PR description links the PRD section or plan the change traces to,
  or, for development-process tooling, the issue.
