# ADR template

Copy the block below into `docs/decisions/NNNN-kebab-title.md` and replace
every `<…>` placeholder. Delete the `Supersedes` line when there is nothing
to supersede. Every other section is required.

````markdown
# NNNN. <Title in imperative form>

- **Status:** Proposed
- **Date:** <YYYY-MM-DD>
- **Supersedes:** [<MMMM>](<MMMM-title>.md)
- **PRD:** <§ sections this decision touches, e.g. §8 Architecture>

## Context

<The problem and the forces at play: requirements, constraints, PRD
sections, earlier ADRs. Facts, not the decision. For a supersede, say what
changed since the old ADR.>

## Decision

<One or two sentences in active voice: "Use X for Y.">

## Alternatives considered

### <Alternative 1>

- Pros: <…>
- Cons: <…>
- Rejected because: <a concrete reason tied to the context>

### <Alternative 2>

- Pros: <…>
- Cons: <…>
- Rejected because: <…>

## Consequences

- Good: <what becomes easier>
- Bad: <what becomes harder, costs, risks>
- Follow-up: <work this decision creates, with issue links when known>
````

## Field rules

| Field | Rule |
| --- | --- |
| Title | Imperative, matches the filename slug. |
| Status | One of `Proposed`, `Accepted`, `Superseded by [MMMM](…)`, `Deprecated`. Only the maintainer's approval moves it past Proposed. |
| Date | ISO 8601. The proposal date, replaced by the approval date on acceptance. Not changed when superseded. |
| Supersedes | Present only on an ADR that replaces another. |
| PRD | The PRD sections traced (Principle I). |
| Alternatives | At least two, each with a concrete rejection reason. |
| Consequences | All three of good, bad and follow-up; write "None" for an empty one rather than leaving it out. |

## Index row

`docs/decisions/README.md` holds one row per ADR:

```markdown
| [NNNN](NNNN-kebab-title.md) | <Title> | <Status> | <YYYY-MM-DD> |
```
