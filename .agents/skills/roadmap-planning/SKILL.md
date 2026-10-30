---
name: roadmap-planning
description: Use when deciding what to build first or next from docs/PRD.md, turning the PRD into milestones, epics or stories on the GitHub project board, breaking an epic into stories, updating the roadmap after a PRD change, a new decision record or a retrospective finding, or asking how far along a phase or milestone is. Triggers include "plan what to build first", "set up the roadmap", "break this epic into stories", "refine epic #N", "the PRD changed, update the roadmap", "replan", "what's next", "Phase 0 status" and edits to docs/ROADMAP.md.
license: MIT
---

# Roadmap planning

Turns `docs/PRD.md` into milestones, then epics, then stories on the
GitHub project board (project 34), keeps `docs/ROADMAP.md` in sync, and
re-plans when the PRD changes. It chooses *which* feature to plan next;
`pdd` then designs that one feature.

Core rule: every milestone, epic and story traces to a PRD section, and
nothing on GitHub is created, edited, relabelled or closed until the
maintainer approves that exact change in chat (Principles I and IV).

## When not to use it

- Designing one feature in depth: use `pdd` (`agent-sop`).
- Turning one approved story into code tasks: use `code-task-generator`.
- Process or tooling work (skills, CI, labels): plan it as an ordinary
  issue; this skill plans product work from the PRD only. Never attach
  product epics to process epics.
- Estimating time or story points, or syncing to a tracker other than
  GitHub: out of scope.

## Choose a mode

| Mode | Trigger | Ends with |
| --- | --- | --- |
| A. Initial roadmap | No product epics exist yet, or the user asks what to build first. | Approved milestones and thin epics on the board. |
| B. Refine an epic | An epic is `**Refined:** no` and is next in build order, or the user names one. | Approved stories as sub-issues of the epic. |
| C. Replan | `docs/PRD.md` changed, a new ADR in `docs/decisions/`, or a retrospective finding. | Updated issues, `stale` labels proposed, dated `Decision:` lines. |
| D. Status | "Status", "what's next", "how far along is Phase N". | A progress report; nothing written. |

If product epics already exist and the user asks to "plan the roadmap",
run Mode D first and show what exists; do not create a second set.

## Rules for every mode

1. **Read first.** `docs/PRD.md` (§3 Goals, §5 Core workflow, §6
   Features and priorities, §7, §9 Release plan, §11 Risks),
   `AGENTS.md` § Principles, `docs/ROADMAP.md` if present, and the
   current board (read commands in
   [references/github-commands.md](references/github-commands.md)).
2. **Trace.** Cite PRD sections as `PRD §6.2 <feature name>`. Anything
   that traces to no PRD section is not proposed; if it should exist,
   propose a PRD change first (Principle I).
3. **Approval gate.** Present the full proposal, then stop and wait.
   Approval covers what was shown; anything new or changed after it is
   presented again. Creating, editing, labelling, adding to the board and
   closing all need approval. Never close or delete an issue without the
   maintainer naming it.
4. **No `gh`, no writes.** If `gh auth status` fails, or the user says not
   to write, print the planned issues as markdown in the template format
   and list the commands you would run.
5. **Labels.** If `.github/labels.yml` (or `.json`) exists, use its names
   for type, area, priority and size. Otherwise use `epic`, `story` and
   `stale` only, creating `story` or `stale` (after approval) when first
   needed. Do not invent other labels.
6. **Board.** Every epic and story is added to project 34 with Status
   Todo, and gets the milestone of its phase.
7. **Drafts.** Write proposals and issue bodies to
   `output/planning/roadmap/` (Git-ignored), then show them in chat.
8. **Sync the index.** After any approved write, update `docs/ROADMAP.md`
   (format below).

## Mode A: Initial roadmap

1. **Milestones.** One per PRD §9 phase, titled `Phase <n> — <name>`
   (`Phase 0 — Foundation`, `Phase 1 — MVP`, `Phase 2 — v1.0`,
   `Phase 3 — Forge Board`, `Phase 4 — Cloud`). The description is the
   phase's §9 exit criterion, verbatim. Reuse milestones that exist.
2. **Capability map.** For the next one or two phases, list the
   capabilities each needs, one row per capability:

   | Capability | PRD ref | Milestone | Depends on |
   | --- | --- | --- | --- |
   | `npx` starts server and opens browser | §6.2 `npx` launch, §8 | Phase 0 | — |

   Phase 1 is "all P0 features" and Phase 2 "all P1 features" (§9), so
   every P0 feature in §6 appears in a Phase 1 or earlier row. Dependency
   arrows point one way; two capabilities that need each other are one.
3. **Epics.** Group capabilities into epics, each delivering one outcome a
   user can see, using
   [references/epic-template.md](references/epic-template.md). An epic
   cuts through every layer it needs. Reject an epic that is one layer
   ("Rust workspace", "backend foundation", "all the UI") and regroup.
   A developer-facing PRD item with no user outcome of its own (Typed
   API, test setup) is a capability inside the first epic that needs it,
   not an epic. Epic titles name one outcome: no "and". Every epic, in
   every phase, has PRD refs and 2–5 testable done-when checks.
4. **Cover the exit criteria.** Each milestone's §9 exit criterion is a
   done-when check of at least one epic in it. Name which.
5. **Order.** Give each epic its dependencies and put them in build
   order. Put the riskiest dependency (PRD §11) early.
6. **Scope the depth.** Write thin epics for the next two phases only.
   Later phases get a milestone and nothing else until they are close.
7. **Present** the milestones, capability map, epics in order with each
   epic's done-when checks written out in full, the exit criterion
   coverage, and open questions with a recommended answer each. The
   maintainer approves the checks that will be created, so none are left
   "to be written at creation". Then stop for approval.
8. **Create** after approval: milestones, epics (label `epic`, milestone,
   `**Refined:** no`), `blocked_by` links, board items with Status Todo.
   Then write `docs/ROADMAP.md`.

## Mode B: Refine an epic into stories

1. **Read** the epic (`gh issue view`), its PRD sections, and related
   ADRs in `docs/decisions/` if that folder exists. If the epic issue does
   not exist, stop and ask; do not plan against an invented number.
2. **Open questions.** List each with a recommendation: *settle now*,
   *spike* (a timeboxed XS/S story), or *defer to the story*. Ask the
   maintainer to settle them before writing stories. Include scope gaps
   between the epic's PRD refs and its outcome (a ref with no done-when
   check, or the reverse).
3. **Write stories** as vertical slices using
   [references/story-template.md](references/story-template.md). Each
   story changes something a user can see or run. A pure contract or
   "server side of X" story is a horizontal slice: fold it into the first
   story that shows its result to a user.
4. **Check every story before presenting** and split any that fails:

   - [ ] size XS, S or M (L and XL are split);
   - [ ] title has no "and", "&", "plus" or two outcomes joined by a comma;
   - [ ] at most 3 acceptance criteria, each testable;
   - [ ] PRD ref, `Blocked by` line, likely areas, size and next step.

   Every epic done-when check is covered by at least one story's criteria.
5. **Present** stories in build order with the check results, then stop
   for approval.
6. **Create** after approval: each story as an issue (label `story`, the
   epic's milestone), linked as a **sub-issue** of the epic, `blocked_by`
   links, added to project 34 with Status Todo. Then set the epic to
   `**Refined:** yes`, fill its "Stories" list, and update
   `docs/ROADMAP.md`.
7. **Hand off.** Each story's "Next step" names `pdd` (needs design) or
   `code-task-generator` then `code-assist` (clear). Do not start either.

## Mode C: Replan

1. **Confirm the source.** For a PRD change, show it with
   `git log -p -3 -- docs/PRD.md` or `git diff -- docs/PRD.md`. If the
   PRD does not yet say what the user describes, propose the PRD edit,
   classify it (step 2) and list the roadmap impact you expect, then stop:
   the PRD changes before the roadmap (Principle I).
2. **Classify each change** as one of:
   - **What**: required scope or priority changed (a feature moved
     P1 → P0, a requirement added or removed). Requirements in issues
     change.
   - **How**: only delivery changed (approach, order, technology).
     Requirements stay; stories, order or dependencies change.
3. **Find what it touches.** List affected milestones, epics and stories
   by number. If no epics exist yet, say so and offer Mode A instead.
4. **Propose, requirements first:**
   - edit epic bodies (outcome, boundaries, done-when) before stories;
   - keep issue numbers: edit, never recreate;
   - move epics between milestones when a priority changed;
   - stories that no longer belong get the `stale` label and are listed;
     they stay open;
   - a dated line for each affected epic's "Decisions" section:
     `Decision: YYYY-MM-DD — <what changed and why>`;
   - new epics or stories for new scope (Mode A or B format).
5. **Present and stop for approval.** Closing a `stale` issue is a
   separate decision the maintainer makes by number.
6. **Apply** approved edits, then update `docs/ROADMAP.md`.

## Mode D: Status

Read only. For each milestone: open and closed epics, each epic's
sub-issue progress (`sub_issues_summary`), blocked items and `stale`
items. Recommend the next story: the first open story, in build order, of
the earliest unfinished milestone whose blockers are all closed. If
`docs/ROADMAP.md` disagrees with GitHub, say so and offer to sync it.

## `docs/ROADMAP.md` format

An index, not a copy of the issue bodies. Created by the first approved
Mode A run; rewritten in full on every sync.

```markdown
# Roadmap

Index of product work on the [IngeniousForge board](https://github.com/users/yokesh-ks/projects/34).
Scope comes from [docs/PRD.md](PRD.md); detail lives in the linked issues.

Last synced: YYYY-MM-DD

## Phase 0 — Foundation

Exit: <PRD §9 exit criterion>
[Milestone](<milestone url>) · epics closed 0/3

| Epic | PRD | Refined | Stories done | State |
| --- | --- | --- | --- | --- |
| [#30 Forge opens in the browser](<url>) | §6.2 | yes | 2/4 | open |
| [#31 Agent edits a file in one session](<url>) | §6.1 | no | — | open |

## Phase 1 — MVP
…

## Stale

- [#45 <title>](<url>) — Decision YYYY-MM-DD on #31
```

Phases with a milestone but no epics show `No epics yet.`

## Outputs

- Milestones, `epic` and `story` issues, sub-issue and `blocked_by`
  links, and project 34 items, after approval.
- `docs/ROADMAP.md`, the committed index.
- `output/planning/roadmap/`: drafts and issue bodies (Git-ignored).

## Common rationalisations

| Excuse | Reality |
| --- | --- |
| "Foundation work has to come first, so a backend epic is fine." | A walking skeleton through every layer is the foundation. A layer-only epic shows nothing a user can see. |
| "This story needs a fourth criterion." | Then it is two stories. Split it. |
| "'Mode and sandbox' is one header widget." | "And" means two outcomes. Name the one outcome or split. |
| "Later-phase epics don't need done-when yet." | Then don't write them yet: milestone only. Every written epic has checks. |
| "The story is obsolete, so closing it is tidy." | Label it `stale` and list it. Closing is the maintainer's call. |
| "The user said the PRD changed." | Read the PRD. If it does not say so, the PRD edit comes first. |

## Red flags

- An epic or story with no PRD section ref.
- A title containing "and", or a story with more than three criteria.
- An epic named after a layer or technology.
- Any `gh` write before the maintainer approved that change.
- Closing, deleting or bulk-editing issues another plan owns.
- A story created without its sub-issue link or board item.
- Replanning before the PRD says what changed.
- `docs/ROADMAP.md` holding issue bodies instead of links.

## Provenance

Adapted from `planning-and-task-breakdown` and `spec-driven-development`
in https://github.com/addyosmani/agent-skills, paths
`skills/planning-and-task-breakdown/` and `skills/spec-driven-development/`,
commit `eb07f19f52c2669f2364897aaa293e2aaddd7b1c`, MIT License, Copyright
(c) 2025 Addy Osmani. See `LICENSE`. Forge kept vertical slicing, XS–XL
sizing with its split rules, the external-tracker and never-overwrite
rules, and the capability map; it replaced the `tasks/` files with GitHub
issues plus `docs/ROADMAP.md`. Thin-then-refined epics and the replan flow
follow general planning practice; no text was copied for them.
