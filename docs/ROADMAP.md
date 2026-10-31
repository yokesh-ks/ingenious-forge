# Roadmap

Index of product work on the [Ingenious Forge board](https://github.com/users/yokesh-ks/projects/34).
Scope comes from [docs/PRD.md](PRD.md); detail lives in the linked issues.

Last synced: 2026-10-31

> **Note — milestones pending:** The five Phase milestones need to be created on
> GitHub (Settings → Milestones) with the titles and exit criteria below, then
> assigned to the open epics.

---

## Phase 0 — Foundation

Exit: `npx ingenious-forge` opens the browser, and a prompt there edits a file and the diff appears (PRD §9)

| Epic | PRD | Refined | Stories | State |
| --- | --- | --- | --- | --- |
| [#62 `npx` starts the server and opens the browser](https://github.com/yokesh-ks/ingenious-forge/issues/62) | §6.2, §8 | yes | #75, #76, #77 | open |
| [#63 Agent works and streams live in the browser](https://github.com/yokesh-ks/ingenious-forge/issues/63) | §6.1, §6.2 | yes | #78, #79, #80, #81 | open |
| [#64 Changed files and diff review](https://github.com/yokesh-ks/ingenious-forge/issues/64) | §6.2 | yes | #82, #83 | open |

---

## Phase 1 — MVP

Exit: A user completes a real coding task end to end — prompt, approvals, review, commit, push — without leaving the browser (PRD §9)

| Epic | PRD | Refined | Stories | State |
| --- | --- | --- | --- | --- |
| [#65 Projects and session list](https://github.com/yokesh-ks/ingenious-forge/issues/65) | §6.2 | yes | #84, #85, #86 | open |
| [#66 Sessions survive restarts and can be resumed](https://github.com/yokesh-ks/ingenious-forge/issues/66) | §6.1 | yes | #87, #88 | open |
| [#67 Agent loads project instructions (AGENTS.md)](https://github.com/yokesh-ks/ingenious-forge/issues/67) | §6.1 | yes | #89, #90 | open |
| [#68 User picks a model and reasoning effort per session](https://github.com/yokesh-ks/ingenious-forge/issues/68) | §6.1 | yes | #91, #92 | open |
| [#69 Agent runs shell commands and output streams live](https://github.com/yokesh-ks/ingenious-forge/issues/69) | §6.1 | yes | #93, #94 | open |
| [#70 Agent commands are confined to the project sandbox](https://github.com/yokesh-ks/ingenious-forge/issues/70) | §6.1 | yes | #95, #96, #97, #98 | open |
| [#71 User controls agent autonomy with approval modes](https://github.com/yokesh-ks/ingenious-forge/issues/71) | §6.1, §6.2 | yes | #99, #100, #101 | open |
| [#72 Workspace panel: file tree, viewer and terminal](https://github.com/yokesh-ks/ingenious-forge/issues/72) | §6.2 | yes | #102, #103 | open |
| [#73 Git actions: branch, commit and push from the browser](https://github.com/yokesh-ks/ingenious-forge/issues/73) | §6.2 | yes | #104, #105, #106 | open |
| [#74 Settings: providers, defaults and GitHub connection](https://github.com/yokesh-ks/ingenious-forge/issues/74) | §6.2 | yes | #107, #108, #109 | open |

---

## Phase 2 — v1.0

Exit: The team uses Forge daily to build Forge (PRD §9)

No epics yet. P1 features from PRD §6.1 and §6.2 are planned here after Phase 1 ships.

---

## Phase 3 — Forge Board

Exit: Several tasks run in parallel in isolated worktrees and end as merged PRs (PRD §9)

No epics yet. Scope from PRD §6.3.

---

## Phase 4 — Cloud

Exit: A team shares projects and boards across machines (PRD §9)

No epics yet. P2 features and team mode from PRD §6.

---

## Build order

```
Phase 0:  #62 → #63 → #64

Phase 1 dependencies:  #64 → #65 → #66, #67, #68, #72, #73, #74   (in parallel after #65)
          #63 → #69 → #70 → #71
          #65 → #71
          #65 + #71 → #73
```

## Stale

None.
