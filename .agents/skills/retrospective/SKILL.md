---
name: retrospective
description: Use when an epic or milestone closes and the team wants to learn from it. Gathers evidence of what was delivered, analyses what went well and what didn't, gives an acceptance verdict against the epic's done-when checks, and proposes owned action items — especially improvements to AGENTS.md, principles, skills and agent memory. Proposes changes; the human decides. Triggers include "run a retro", "retrospective on epic #N", "what did we learn from this epic", and "retro the milestone".
license: MIT
---

# Retrospective

Review a completed epic (or milestone) against the evidence it left
behind: issues, PRs, review threads, ADRs, analysis reports and commits.
Produce a retrospective document with sourced findings, an acceptance
verdict and owned action items. Every finding must cite a source;
unsourced findings are dropped.

This skill governs how agents work on Forge. It is a development-process
rule, not a Forge product feature, and does not belong in `docs/PRD.md`.

## When not to use it

- Mid-epic progress checks (use `plan-analysis` converge mode instead).
- Planning the next epic (use `roadmap-planning`).
- Reviewing a single PR (use `change-review`).

---

## Scope

The input is one of:

- An **epic issue number** (default): `#N`.
- A **milestone name**: the retro covers all issues in the milestone.

If the epic has unfinished sub-issues, list them and ask the user whether
to proceed. If they decline, stop.

---

## Workflow

### 1. Concerns

Before gathering anything, ask the user:

> Is there anything you want me to weight or pay special attention to in
> this retrospective?

Wait for their answer. Incorporate their concerns into the analysis
phase. If they say nothing special, proceed.

### 2. Gather

Build an evidence inventory using `gh` and `git`. See
[`references/evidence-gathering.md`](references/evidence-gathering.md)
for the exact commands.

Collect:

- The epic issue and its sub-issues (closed and open), with their
  acceptance criteria.
- Merged PRs linked to those issues, their review threads and the
  combined diff from the first to the last merge.
- ADRs added or superseded during the epic (files in `docs/decisions/`
  whose commits fall in the epic's range).
- `plan-analysis` reports and verification blocks in PR bodies.
- Re-plans: `Decision:` lines in the epic or its sub-issues.

**Record what is missing.** For example: "story #12 has no linked PR",
"no review threads found for PR #45". A reader must be able to tell
"checked and clean" from "never checked".

### 3. Analyze

Work from the evidence inventory. Every finding must cite its source
(issue number, PR number, commit SHA, file path). Drop any finding you
cannot tie to a source.

#### Delivery

- Planned vs delivered stories: which were completed, added or dropped.
- Scope changes and re-plans, with their reasons.

#### Quality

- Recurring review findings, grouped by type (from PR review threads).
- Verification misses: acceptance criteria marked met in a PR that were
  later found unmet.
- Bugs found after merge.

#### Spec alignment

- What was built vs the epic's PRD sections.
- Drift to fix in the code, or drift to reconcile in the PRD.

#### Process

- Where the skills helped: steps that caught real issues or saved time.
- Where the skills got in the way: steps that were skipped, caused
  friction or produced boilerplate.

#### Behaviour check

If the epic changed runtime behaviour, run the main flow end to end and
record what was observed. If there is no runtime to check (docs-only,
planning-only), say so.

### 4. Decide

#### Acceptance verdict

Compare the evidence against the epic's done-when criteria, one by one:

| Criterion | Evidence | Met? |
| --- | --- | --- |
| *(from the epic)* | *(source)* | yes / no / partial |

The verdict is one of:

- **accepted**: every criterion met, no blocking findings.
- **accepted-with-open-items**: criteria met, but deferred findings or
  minor items remain (list them).
- **rejected**: one or more criteria not met, or a blocking finding is
  unresolved (with reasons).

#### Action items

Each item has an **owner** (person or role), a **type** and a
**target**:

| Type | Meaning | Target |
| --- | --- | --- |
| `fix` | Code or spec reconciliation | A proposed new story issue |
| `instruction` | A proposed edit to `AGENTS.md`, a principle, a skill or agent memory | The file and section |
| `decision` | A proposed ADR | `docs/decisions/` |

Instruction-type items that change a principle route through the
governance rules in `AGENTS.md` (a separate `docs(principles):` commit).

**Nothing is applied automatically.** Present the list to the user.
Create issues, edits or ADRs only for the items the user explicitly
approves.

#### Decision-record reconciliation

If any ADR was added during the epic, check whether the code still
matches the decision. If it drifted, propose a fix or a superseding ADR.

### 5. Finalize

Write the retrospective document to
`docs/retrospectives/<YYYY-MM-DD>-<epic-slug>.md` using the template in
[`references/retro-template.md`](references/retro-template.md).

Comment on the epic issue with the verdict and a link to the document:

```bash
gh issue comment <N> --body "Retrospective: **<verdict>**. See docs/retrospectives/<file>.md"
```

**Do not close the epic.** Closing is the user's decision
(Principle IV).

---

## Red flags

Stop and check if you notice any of these:

- About to include a finding with no source citation.
- About to apply an action item without user approval.
- About to close the epic issue.
- About to change a principle without routing through governance.
- About to write "accepted" when a done-when criterion is not met.
- About to skip the user-concerns step.

## Outputs

- The retrospective document under `docs/retrospectives/`.
- A comment on the epic issue with the verdict.
- Proposed action items (not applied until approved).

## Provenance

Adapted from the retrospective skill in
https://github.com/bmad-code-org/BMAD-METHOD, path
`skills/bmad-retrospective/`, commit
`61e01f82644c4bb533750cfa0d6d61ab61d2cc9b`, MIT License, Copyright (c)
2025 BMad Code, LLC. See `LICENSE`. Forge kept: the five-phase structure
(gather, analyze, decide, finalize), the sourced-findings rule, the
accepted/accepted-with-open-items/rejected verdict, the evidence
inventory with gap tracking, the aggregate analysis views, and the
action-item routing. Forge dropped: the team discussion phase, the
TOML ticket tree, `customize.toml`, personas and the `render_skill.py`
launcher. Forge added: the user-concerns step, GitHub-native evidence
gathering (`gh` and `git`), the behaviour-check step, instruction-type
action items with principle governance routing, and the retro document
template with frontmatter.
