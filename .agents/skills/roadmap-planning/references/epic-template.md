# Epic template

An epic is one GitHub issue labelled `epic`, assigned to a milestone and
added to project 34. It delivers one outcome a user can see. It starts
**thin** (`refined: no`) and is refined in Mode B before any story is
written.

## Title

`<Outcome as a noun phrase>`, for example `Browser chat streams a live
session`. No "and": two outcomes are two epics. No layer names alone
("Backend", "Database").

## Body

```markdown
**Refined:** no
**Milestone:** Phase <n> — <name>
**PRD:** §<x.y> <feature>, §<x.y> <feature>

## Outcome

<One or two sentences: what a user can do when this epic is done, in the
PRD's words.>

## Boundaries

- In: <capability, PRD §ref>
- In: <…>
- Out: <nearby capability that belongs to another epic or milestone, and
  where it lives>

## Done when

- [ ] <Observable check a reviewer can run, e.g. "`npx ingenious-forge`
  opens the browser on the home page">
- [ ] <…>

## Dependencies

- Blocked by #<n> <epic title>   <!-- or "None" -->

## Open questions

- <Question> — recommended: <settle now | spike | defer to story>: <pick>

## Stories

<!-- Filled in Mode B: sub-issues in build order. Leave empty while thin. -->

## Decisions

<!-- Mode C appends one line per replan:
Decision: YYYY-MM-DD — <what changed and why> -->
```

## Rules

- **PRD refs are required.** Every capability in "Boundaries → In" names a
  PRD section. An epic with no PRD ref does not trace to the PRD
  (Principle I) and is not proposed.
- **Done-when checks are testable.** Each one names something a person can
  run or observe. "Works well" and "is complete" are not checks. Reuse the
  milestone's PRD §9 exit criterion when the epic delivers it.
- **2–5 done-when checks.** More than five means the epic holds two
  outcomes; split it.
- **Thin means thin.** Before refinement, leave "Stories" empty and keep
  open questions as questions. Set `**Refined:** yes` only after the
  stories are approved and created.
- **Stable ids.** The issue number is the epic's id. Never recreate an
  epic to change it; edit its body.

## Example (thin)

```markdown
**Refined:** no
**Milestone:** Phase 0 — Foundation
**PRD:** §6.2 `npx` launch, §6.2 Host server, §8 Distribution

## Outcome

A user runs `npx ingenious-forge` and the Forge home page opens in their
browser, served by the local server.

## Boundaries

- In: `npx` entry script that starts the server binary (§6.2 `npx` launch)
- In: local server on `localhost` serving the web UI (§6.2 Host server)
- Out: projects and session list (Phase 1, epic "Open a project")

## Done when

- [ ] `npx ingenious-forge` on macOS opens the browser on the home page
- [ ] The server listens on `localhost` only by default

## Dependencies

- None

## Open questions

- Prebuilt binaries for all three OSes in Phase 0? — recommended: defer to
  story: macOS first, others in Phase 1.
```
