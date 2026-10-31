# Retrospective document template

Use this template for `docs/retrospectives/<YYYY-MM-DD>-<epic-slug>.md`.
Replace placeholders in `< >` with actual values. Remove the template
instructions (lines starting with `>`).

---

```markdown
---
epic: "<#N — epic title>"
milestone: "<milestone name, or omit if none>"
date: <YYYY-MM-DD>
verdict: "accepted"  # one of: accepted, accepted-with-open-items, rejected
---

# Retrospective: <epic title>

**Epic:** #<N>
**Date:** <YYYY-MM-DD>
**Verdict:** **<verdict>**

## Summary

> One paragraph: what the epic set out to do, what was delivered and the
> headline result.

## Evidence inventory

> Copy the inventory from the gather phase. Every item is marked as
> found, missing or not applicable.

| Evidence | Status | Notes |
| --- | --- | --- |
| Epic issue | ✓ | |
| Sub-issues | ✓ N closed, M open | |
| Merged PRs | ✓ N found | story #X has no linked PR |
| Review threads | ✓ / partial | |
| ADRs | ✓ / none | |
| Verification blocks | ✓ / partial | |
| Re-plans | ✓ / none | |
| Behaviour check | ✓ / not applicable | |

## What went well

> Bulleted list. Each item cites a source (PR, issue, commit, file).

## What didn't go well

> Bulleted list. Each item cites a source.

## Findings

> Group by analysis category. Every finding has a source citation.
> Unsourced findings must not appear here.

### Delivery

> Planned vs delivered, scope changes, re-plans.

### Quality

> Recurring review findings, verification misses, post-merge bugs.

### Spec alignment

> Built vs specified, drift in code or PRD.

### Process

> Skill effectiveness, friction points.

### Behaviour check

> What was observed when running the changed flows, or "not applicable"
> with a reason.

## Verdict

> Criterion-by-criterion table, then the verdict.

| Criterion | Evidence | Met? |
| --- | --- | --- |
| | | |

**Verdict: accepted**  # replace with actual verdict; one of: accepted, accepted-with-open-items, rejected

> If accepted-with-open-items, list the open items.
> If rejected, state the reasons.

## Action items

| # | Type | Description | Owner | Status |
| --- | --- | --- | --- | --- |
| 1 | fix / instruction / decision | | | proposed |

> Status is one of: proposed, approved, declined, deferred.
> Items start as "proposed". Update after user review.
> Instruction-type items that touch a principle note the governance
> requirement (separate `docs(principles):` commit).
```

---

## Notes for the agent

- Do not include time estimates in the document.
- The frontmatter `verdict` field must match the Verdict section exactly.
- Create the `docs/retrospectives/` directory if it does not exist.
- After writing the document, comment the verdict on the epic issue.
- Do not close the epic issue.
