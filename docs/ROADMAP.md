# Roadmap

Index of product work on the [Ingenious Forge board](https://github.com/users/yokesh-ks/projects/34).
Scope comes from [PRD.md](PRD.md); detail lives in the linked issues.

Last synced: 2026-11-22 (chat epics only; see Phase 2)

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

### Chats (planned 2026-11-22)

| Epic | PRD | Refined | Stories | State |
| --- | --- | --- | --- | --- |
| [#244 The user works with the agent in a chat](https://github.com/yokesh-ks/ingenious-forge/issues/244) | §6.2 Chats | yes | #252, #253, #254, #256, #257, #255 | open |
| [#245 The agent searches the web](https://github.com/yokesh-ks/ingenious-forge/issues/245) | §6.1 Web search | yes | #258, #263, #272, #273 | open |
| [#246 The agent drives a browser](https://github.com/yokesh-ks/ingenious-forge/issues/246) | §6.1 Browser | yes | #259, #264, #265, #274, #266, #267 | open |
| [#247 The agent writes a researched report](https://github.com/yokesh-ks/ingenious-forge/issues/247) | §6.1 Research | yes | #275, #281, #282, #285 | open |
| [#248 User previews a web app the agent runs](https://github.com/yokesh-ks/ingenious-forge/issues/248) | §6.2 Workspace panel | yes | #260, #268 | open |
| [#249 User teaches the agent a reusable skill](https://github.com/yokesh-ks/ingenious-forge/issues/249) | §6.1 Skills | yes | #223, #278, #279, #280, #283, #286, #284 | open |
| [#250 A chat runs on a schedule](https://github.com/yokesh-ks/ingenious-forge/issues/250) | §6.2 Scheduled chats | yes | #261, #269, #276, #277 | open |
| [#251 Chats share instructions in a folder](https://github.com/yokesh-ks/ingenious-forge/issues/251) | §6.2 Chats | yes | #262, #270, #271 | open |

The other Phase 2 epics filed on 2026-11-11 (#137, #171–#185, #239–#241) are not yet indexed here; a full sync is pending.

---

## Phase 3 — Forge Board

Exit: Several tasks run in parallel in isolated worktrees and end as merged PRs (PRD §9)

No epics yet. Scope from PRD §6.3.

---

## Build order

```
Phase 0:  #62 → #63 → #64

Phase 1 dependencies:  #64 → #65 → #66, #67, #68, #72, #73, #74   (in parallel after #65)
          #63 → #69 → #70 → #71
          #65 → #71
          #65 + #71 → #73

Chats (Phase 2):  #252 → #253, #254, #256, #257, #255, #262, #269, #273
          #170 + #258 → #263 → #272, #273, #275
          #259 → #264, #265, #266, #267;  #265 → #274
          #211 + #263 → #275 → #281, #282 → #285
          #260 → #268;  #261 → #269 → #276, #277
          #223 → #278 → #283 → #286;  #223 → #279, #280;  #223 + #256 → #284
```

## Stale

None.
