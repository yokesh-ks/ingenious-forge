---
name: change-review
description: Use when a change is ready for review before merging to main, after completing a story, when stuck or before a risky refactor (request mode); or when review feedback has arrived and must be evaluated and acted on (receive mode). Triggers include "review this change", "get a review", "I got feedback", "respond to review", "push back on a comment", and "handle this review".
license: MIT
---

# Change review

Two-sided review skill: **Request** gets an independent review of a change
from a fresh reviewer subagent (or a human); **Receive** evaluates incoming
feedback rigorously before touching a single line.

Named `change-review` to avoid clashing with the built-in `code-review`
command. The skill may use that command as one reviewer engine when it is
available, but it works without it.

This skill governs how agents work on Forge. It is a development-process
rule, not a Forge product feature, and does not belong in `docs/PRD.md`.

## When not to use it

- Reviewing planning documents (use `plan-analysis` instead).
- Automated PR bots or CI integration.
- Read-only work: answering questions, summaries or investigation with no
  change pending.

---

## Request mode

### When review is required

- Before any PR to `main`.
- After each completed story.

### When review is optional

- When stuck on a design or correctness question.
- Before a risky refactor.
- After fixing a complex bug where the fix might introduce new issues.

### Precondition

`verify-before-done` must have passed before requesting review. Do not
spend a review on code that does not pass its own checks: a failing check
is a defect, not a reviewer question.

### Workflow

#### 1. Collect context

Gather, from the current issue or `.code-task.md`:

- The story or issue text and its acceptance criteria.
- The PRD sections the story cites.
- Related ADRs from `docs/decisions/`.
- The Principles section of `AGENTS.md`.
- `BASE_SHA`: `git merge-base origin/main HEAD`
- `HEAD_SHA`: `git rev-parse HEAD`

#### 2. Dispatch the reviewer

Spawn a reviewer subagent with a clean context using the template in
[`references/reviewer-prompt.md`](references/reviewer-prompt.md).
Fill in these placeholders before dispatching.

**Agent portability:** if your agent cannot spawn a subagent, start a
fresh session (or ask a colleague) with only the filled template as
context. The reviewer must not share your working session's history.
A human reviewer using the same template also satisfies this step.

| Placeholder | Value |
| --- | --- |
| `{DESCRIPTION}` | One paragraph: what was built and why |
| `{PLAN_OR_REQUIREMENTS}` | Story, acceptance criteria and cited PRD sections |
| `{BASE_SHA}` | From step 1 |
| `{HEAD_SHA}` | From step 1 |

Give the reviewer crafted context, not your session history. The reviewer
must not change the working tree, index or HEAD.

#### 3. Act on findings

| Severity | Action |
| --- | --- |
| **Critical** | Fix immediately, before doing anything else. Rerun `verify-before-done`. |
| **Important** | Fix before proceeding. Rerun `verify-before-done`. |
| **Minor** | Note for later; do not block the PR. |

If a finding is wrong, push back with technical reasoning (see Receive
mode). Never dismiss a Critical or Important finding without either fixing
it or recording a principled rebuttal in the PR discussion.

#### 4. Human approval

Human approval on GitHub is the final gate (Principle IV). The subagent
review supplements it and never replaces it. Do not close the issue or
merge until the maintainer has approved the PR.

### Red flags

Stop and check if you notice any of these:

- About to request review when `verify-before-done` has not passed.
- About to fix a Critical finding without running `verify-before-done`
  afterward.
- About to proceed past an Important finding without resolving it.
- About to dismiss reviewer feedback as wrong without checking the code.

---

## Receive mode

### Workflow

#### READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT

**Read all the feedback before acting.** Do not start implementing the
first item while still reading the rest.

#### 1. Read

Read every comment before touching any code.

#### 2. Understand

Restate each item as a technical requirement in your own words. If any
item is unclear, ask about **all** unclear items before implementing any
of them.

> The clarification rule: if a multi-item request has even one unclear
> item, implement nothing until you have asked about it.

#### 3. Verify

Check each claimed problem against the actual code.

- Does the file and line exist?
- Does the code behave the way the reviewer claims?
- Does the reviewer have full context (imports, callers, tests)?

If you cannot verify a claim, say so explicitly: "I can't reproduce this
at `<file>:<line>`."

#### 4. Evaluate

For each item, ask:

- Is this technically correct for this codebase?
- Does it conflict with the PRD, an ADR or a Principle? (cite the
  reference)
- Is it YAGNI? (grep for usage before accepting a suggestion to add,
  change or preserve a "professional" feature)
- Does the reviewer have enough context to judge this correctly?

#### 5. Respond

Give a technical acknowledgement or a reasoned pushback. Never use
performative phrases:

**Forbidden:** "You're absolutely right!", "Great point!", "Excellent
suggestion!", "That's a really good catch."

**Instead:**

- Agreement: state what the fix will be, or simply make the change.
- Pushback: cite the specific code, test, PRD section, ADR or Principle
  that shows the reviewer is wrong. Keep it factual.
- Architectural matter: involve the maintainer rather than unilaterally
  overriding the reviewer.

If you were wrong to push back, say so briefly and correct it. Do not
dwell.

#### 6. Implement

One item at a time. After each fix, rerun `verify-before-done` before
moving to the next item.

#### 7. Reply on GitHub

For inline PR review comments, reply in the review thread itself using
the replies endpoint:

```bash
gh api repos/{owner}/{repo}/pulls/{n}/comments/{comment_id}/replies \
  -f body="Fixed in <SHA>: <one sentence describing what changed>"
```

Reply in the thread, not as a new top-level PR comment.

### Handling different sources

| Source | Approach |
| --- | --- |
| Maintainer | Implement once understood; ask if scope is unclear. |
| External reviewer (subagent or human) | Apply steps 3–4 with extra skepticism; check correctness, possible context gaps and whether the suggestion breaks existing behavior. |
| Automated tool (linter, CI) | Fix the reported item; do not dismiss without understanding it. |

### Red flags

Stop if you notice any of these in your own draft:

- About to implement feedback without reading all of it.
- About to implement a single unclear item from a multi-item request.
- About to write "You're absolutely right!" or any equivalent.
- About to change code based on a reviewer claim you have not verified
  in the actual file.
- About to push back on a finding you have not checked at all.
- About to mark an item "done" without running `verify-before-done`.

---

## Outputs

- A review report from the subagent (request mode): findings with
  severities, `file:line` citations and a verdict.
- Fixes committed and `verify-before-done` passed after each one.
- GitHub thread replies citing the fix SHA.
- Nothing is written to the repository by this skill itself.

## Provenance

Adapted from two skills in https://github.com/obra/superpowers, paths
`skills/requesting-code-review/` and `skills/receiving-code-review/`,
commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`, MIT License, Copyright
(c) 2025 Jesse Vincent. See `LICENSE`. Forge kept: the reviewer subagent
dispatch with placeholder template, the Critical/Important/Minor severity
tiers, the READ→UNDERSTAND→VERIFY→EVALUATE→RESPOND→IMPLEMENT response
pattern, the forbidden performative phrases, the clarification-before-any-
implementation rule, the YAGNI check, and the GitHub replies endpoint.
Forge added: the mandatory `verify-before-done` precondition, the
Forge-specific review order (PRD/story consistency and Principles before
correctness), human approval as the final gate (Principle IV), the
handling-sources table, and the per-item `verify-before-done` after each
fix.
