# Story template

A story is one GitHub issue labelled `story`, created as a **sub-issue** of
its epic, given the epic's milestone and added to project 34 with Status
Todo (Backlog while a blocker is open). It is a vertical slice: a user-visible change that works end to end
through every layer it touches.

## Title

`<User-visible outcome>`, for example `User sees streamed agent text in the
chat`. One outcome only.

## Body

The headings are the field labels of the Story issue form,
[`.github/ISSUE_TEMPLATE/story.yml`](../../../../.github/ISSUE_TEMPLATE/story.yml),
in the same order, so a story written with `gh` reads like one filed in
the browser.

```markdown
### Epic

#<epic>

### Outcome

<One sentence: what the user can see or do after this story.>

### Why

<One sentence: why this outcome matters to the user right now — the
motivation that guides implementation decisions.>

### Acceptance criteria

- [ ] <Testable condition>
- [ ] <Testable condition>
- [ ] <Testable condition>   <!-- three at most -->

### PRD references

PRD §<x.y> <feature>

### Size

<XS | S | M>

### Priority

<P0 | P1 | P2>

### Dependencies

- Blocked by #<n>   <!-- or "None" -->

### Likely areas

- `<path or module, e.g. server/, web/src/session/>`

### How to verify

<Commands to run, or a manual check that shows the outcome works.>

### Next step

<pdd | code-task-generator then code-assist>

### Suggested area

area:<name>
```

## Sizing

| Size | Scope | Example |
| --- | --- | --- |
| XS | One function or config change | Add `--port` flag to the launcher |
| S | One component or endpoint | WebSocket endpoint that sends session events |
| M | One feature slice through 3–5 files | Approval prompt shown and answered in the chat |
| L | Several components | **Split it** |
| XL | Many files or subsystems | **Split it** |

## Split rules

Split a story, before proposing it, when any of these hold:

- its size is L or XL;
- its title contains "and" (or "&", "plus", a comma joining two outcomes;
  a comma before a detail of one outcome, as in "User sees streamed text,
  inline", is fine);
- it needs more than three acceptance criteria;
- it touches two independent subsystems (for example git and the model
  provider);
- it would take more than one focused session to build.

Split by user-visible outcome, not by layer. "API for approvals" plus "UI
for approvals" is a horizontal split; "User approves a command inline" plus
"User sees why an approval was requested" is vertical.

## Acceptance criteria

Each criterion is a condition a reviewer can check by running or looking at
something: a command, a page, a test. Prefer numbers from the PRD (for
example the §7 "< 200 ms" streaming target) over adjectives.

## Hand-off

The "Next step" section tells the next agent which workflow to run:

- `pdd` when the story leaves a design choice open (data model, protocol,
  library);
- `code-task-generator` then `code-assist` when the outcome, criteria and
  areas are already clear.
