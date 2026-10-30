---
name: plan-analysis
description: Use when a feature's planning documents (story issue, pdd design and plan, code task files) exist and someone asks whether the plan is ready to build, to check, analyse, review or sanity-check a plan, spec or task list before code-assist, or to look for gaps, contradictions, missing tasks or principle violations across them. Also use after building, when asked what is still missing, whether everything in the plan was built, whether the work has converged, or to record the remaining work as tasks.
license: MIT
---

# Plan analysis

Check a feature's planning documents against each other, the ADRs and the
principles in `AGENTS.md` before building starts (**analyze** mode), and
check the built code against them afterwards (**converge** mode). Defects
found on paper cost far less than defects found in review.

Two rules hold in every run: **report, never invent** (a missing document
or section is a finding, not a gap to fill), and **write only what the mode
allows** (analyze writes one report; converge appends new task files).

## When not to use it

- Reviewing a diff or a pull request: that is code review, not this skill.
- No `pdd` plan or task files exist yet and none are expected: run the
  `pdd` or `code-task-generator` workflow of `agent-sop` first.
- Fixing the findings. This skill reports and offers fixes; applying them
  is separate work the maintainer approves.
- Deciding what to build next: use `roadmap-planning`.

## Inputs

`<project>` is the planning folder name (`output/planning/<project>/`).

| Role | Forge files |
| --- | --- |
| Principles | `AGENTS.md` § Principles (numbered I–VIII) |
| Requirements | the story issue (`gh issue view <n>`, or a local `story.md` in the planning folder), the `docs/PRD.md` sections it references, `output/planning/<project>/idea-honing.md` |
| Design and plan | `output/planning/<project>/design/detailed-design.md`, `output/planning/<project>/implementation/plan.md` |
| Tasks | `output/tasks/<project>/**/*.code-task.md` (usually `stepNN/task-NN-<title>.code-task.md`) |
| Decisions | `docs/decisions/NNNN-*.md` (ADRs) and their **Status** line |

Core documents: a requirements source (story issue or `idea-honing.md`),
`detailed-design.md`, `plan.md` and at least one task file. The story
issue, PRD sections and ADRs are optional; when one is absent, say which
check was skipped.

## Choose the mode

- **Analyze**: before `code-assist`, or whenever the request is to check
  the plan. The default.
- **Converge**: the user says the tasks were built, or asks what is still
  missing. If neither fits, ask which the user wants.

## Analyze mode (read-only)

1. **Resolve the project.** Take `<project>` from the request, or list
   `output/planning/` and ask if it is ambiguous. Find the story issue from
   the request or from an issue reference in the planning documents. Check
   every core document exists. If any is missing, write `analysis.md` with
   one CRITICAL finding per missing document (category *Missing document*),
   no coverage table and "Coverage: not computed", then stop. Do not
   reconstruct the missing content from the documents that do exist.
2. **Load progressively.** Read only what the passes need: requirements,
   acceptance criteria and edge cases from the requirements sources;
   components, data model, decisions and conventions from the design and
   plan; title, description, technical requirements, acceptance criteria
   and named files or components from each task; Status, decision and
   context from each ADR; every MUST and MUST NOT from the principles.
3. **Build the inventory.** Give every requirement a stable key: its
   explicit ID (`REQ-3`, `FR-2`, story `AC2`) when there is one, otherwise
   a short kebab slug of its phrase. Record, per requirement, the tasks that
   cover it (explicit ID first, keyword match second, and say which).
   Record the components and terms each document uses.
4. **Run passes A–G.** Follow
   [references/detection-passes.md](references/detection-passes.md): A
   Duplication, B Ambiguity, C Underspecification, D Principle alignment,
   E Coverage gaps, F Inconsistency, G ADR conflicts. Every finding cites a
   location (`file:line` or the issue) and quotes the offending text.
5. **Assign severity** with the scale in that reference. Principle
   violations are always CRITICAL and cite the principle number.
6. **Write the report** to `output/planning/<project>/analysis.md` using
   [references/report-template.md](references/report-template.md):
   findings table (at most 50 rows, overflow summarised by category),
   coverage table, principle issues, unmapped tasks, metrics with coverage
   %. Replace any earlier `analysis.md`; it is this skill's own output.
7. **Next actions.** Any CRITICAL: recommend resolving it before
   `code-assist`. Otherwise `code-assist` may proceed; list the suggestions.
8. **Offer fixes.** Ask whether to draft concrete fixes for the top five
   findings (or the number the user names). Apply none until the
   maintainer approves each one.

## Converge mode (after building)

1. **Check the inputs.** The core documents must exist (as in analyze step
   1). Find the code: the paths the request, design, plan or tasks name.
   Read the current code only; no git diffs, branches or history. If no
   code for any task exists, converge does not apply: say so, recommend
   `code-assist` on the existing tasks, and write nothing.
2. **Build the inventory** as in analyze step 3, plus every task's
   acceptance criteria and every design component. A ticked checkbox or a
   "done" claim is not evidence.
3. **Bound the scope** to the files and components the design, plan and
   tasks name, plus a keyword search for each requirement's concepts.
4. **Classify each item** as **met**, **partial** or **unmet**, with
   evidence: a `file:line`, or the command and its output (a search with
   no matches is evidence of unmet). Code that contradicts the plan or a
   principle counts as unmet; cite the principle. A requirement or
   criterion that cannot be measured (such as "fast" with no number) is
   reported as "not assessable", not met, and gets no task: point to the
   analyze finding instead.
5. **Assign severity**: CRITICAL for a principle violation or an unmet
   item that blocks baseline function; HIGH for an unmet or partial core
   requirement or acceptance criterion; MEDIUM for a partial secondary
   item; LOW for polish.
6. **Show the findings** in chat with the converge table from the report
   template, before writing anything.
7. **Append tasks.** For each partial or unmet item, ordered CRITICAL
   first, write a new task file in a new folder
   `output/tasks/<project>/stepNN/`, where `NN` is one more than the highest
   existing step, named `task-01-<slug>.code-task.md`, `task-02-…`. Use the
   `code-task-generator` format; the template in the report reference adds
   the source key, status and evidence. Never edit, rename or delete an
   existing task, `detailed-design.md`, `plan.md`, the story or any code.
   A later run adds another step folder below this one.
8. **Converged.** When every item is met, write nothing and report
   "Converged: the code meets every requirement and task in the plan",
   with the counts checked. Otherwise report how many tasks were written,
   where, and recommend `code-assist` on them followed by another converge
   run.

## Outputs

- Analyze: `output/planning/<project>/analysis.md` only.
- Converge: new `output/tasks/<project>/stepNN/*.code-task.md` files only,
  or no file when converged. The findings go in chat, not in a report file.

## Common rationalisations

| Excuse | Reality |
| --- | --- |
| "The fix is one word; I'll just edit the plan." | Analyze writes only `analysis.md`. Offer the fix and wait. |
| "The design is missing, but I can infer it from the tasks." | Report the missing document as CRITICAL and stop. |
| "'Fast' is clear enough." | No number, no test. It is a HIGH ambiguity finding. |
| "The task is ticked, so it's met." | Ticks are claims. Converge needs a `file:line` or command output. |
| "I'll add the missing step to `plan.md` in converge." | Converge only adds new task files. |
| "A trailer in a commit convention isn't a real defect." | It breaks Principle VII. Principle violations are CRITICAL. |

## Red flags

- About to edit any file under `output/planning/<project>/` other than
  `analysis.md`, or any existing task file.
- A finding with no location, or a principle finding with no number.
- A requirement in the coverage table with tasks you guessed but did not
  mark as inferred.
- A coverage % you did not compute from the coverage table.
- Writing application code in converge mode.

## Provenance

Adapted from the `analyze` and `converge` commands in
https://github.com/github/spec-kit, paths
`templates/commands/analyze.md` and `templates/commands/converge.md`,
commit `ec5495777a9068c2287904db3584c4e1108d15e9`, MIT License, Copyright
GitHub, Inc. See `LICENSE`. Forge kept the six detection passes, the
severity scale, the 50-finding cap, the report and coverage tables, the
offer-only fixes and converge's append-only rule. It mapped the inputs to
Forge's `pdd`, task, ADR and principle files, added pass G for ADR
conflicts, writes the analysis report to a file, appends converge work as
new task files, and dropped spec-kit's paths, prerequisite scripts and
extension hooks.
