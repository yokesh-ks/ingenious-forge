# GitHub commands

Commands for the Forge repository and its board. Every command that
**writes** (create, edit, close, label, add to project) runs only after the
maintainer has approved that exact change in chat.

| Name | Value |
| --- | --- |
| Repository | `yokesh-ks/ingenious-forge` |
| Project | `34`, owner `yokesh-ks` (node id `PVT_kwHOBAdtHM4BpdXc`) |
| Status field | `PVTSSF_lAHOBAdtHM4BpdXczhn47Y8` |
| Status options | Backlog `fdb23e39`, Todo `f75ad846`, In Progress `47fc9ee4`, In Review `011a42ee`, Done `98236657` |
| Priority field | `PVTSSF_lAHOBAdtHM4BpdXczhn6_y8`: P0 `d08c3f9a`, P1 `75517596`, P2 `2b0747d7` |
| Size field | `PVTSSF_lAHOBAdtHM4BpdXczhn6_0o`: XS `58c8132b`, S `ecae9bfa`, M `42f7c129`, L `0b773a21` |
| Phase field | `PVTSSF_lAHOBAdtHM4BpdXczhn6_0w`: 0 Foundation `33879dff`, 1 MVP `89b5dcfa`, 2 v1.0 `92a79d08`, 3 Board `802b4bb6`, 4 Cloud `f19a827e` |
| Labels | From `.github/labels.yml` if it exists; else `epic` (exists), `story`, `stale` (create if missing) |

The ids were read on 2026-10-30 and change if the project or a field is
recreated. `docs/process/project-board.md` defines each status and field
and is the source for these ids. Before the first write in a session, re-read them and
compare with the table; if they differ, use the fresh values and update the
table in the same change:

```bash
gh project view 34 --owner yokesh-ks --format json --jq .id
gh project field-list 34 --owner yokesh-ks --format json
```

`R=yokesh-ks/ingenious-forge` below.

## Check access first

```bash
gh auth status
```

If this fails, write nothing to GitHub: print the planned milestones and
issues as markdown (the templates' bodies under each heading) and say that
`gh` is not authenticated.

## Read

```bash
# Milestones with open and closed counts
gh api "repos/$R/milestones?state=all&per_page=100" \
  --jq '.[] | [.number, .title, .state, .open_issues, .closed_issues] | @tsv'

# Product epics (label epic + a Phase milestone), and stories in a milestone
gh issue list -R $R --label epic --state all --limit 200 \
  --json number,title,state,milestone,labels \
  --jq '[.[] | select(.milestone.title // "" | startswith("Phase "))]'
gh issue list -R $R --milestone "<milestone title>" --state all \
  --json number,title,state,labels

# One issue's body, and its sub-issue progress
gh issue view <n> -R $R --json number,title,body,state,milestone,labels
gh api repos/$R/issues/<n> --jq .sub_issues_summary   # total, completed, percent_completed

# Sub-issues of an epic, and what blocks an issue
gh api repos/$R/issues/<epic>/sub_issues --jq '.[] | [.number, .state, .title] | @tsv'
gh api repos/$R/issues/<n>/dependencies/blocked_by --jq '.[] | [.number, .state] | @tsv'
```

## Milestones

```bash
gh api repos/$R/milestones -f title="Phase 0 — Foundation" \
  -f description="<exit criteria from PRD §9>"
gh api -X PATCH repos/$R/milestones/<number> -f description="<…>"
```

Milestone titles are `Phase <n> — <name>` with the names from PRD §9.

## Labels

```bash
gh label create story -R $R --color 0e8a16 --description "Vertical slice of an epic"
gh label create stale -R $R --color cccccc --description "Obsolete after a replan; awaiting decision"
```

## Issues

```bash
gh issue create -R $R --title "<title>" --body-file <file.md> \
  --label epic --milestone "Phase 0 — Foundation"
gh issue edit <n> -R $R --body-file <file.md>
gh issue edit <n> -R $R --add-label stale
```

Write bodies to a file under `output/planning/roadmap/` and pass
`--body-file`; do not inline long bodies in the shell.

## Sub-issues and dependencies

Both APIs take the issue's numeric **id**, not its number.

```bash
id=$(gh api repos/$R/issues/<story> --jq .id)
gh api repos/$R/issues/<epic>/sub_issues -F sub_issue_id=$id

blocker=$(gh api repos/$R/issues/<blocking> --jq .id)
gh api repos/$R/issues/<story>/dependencies/blocked_by -F issue_id=$blocker
```

If the dependencies endpoint is unavailable, keep the `Blocked by #N`
lines in the body; they are the fallback and are always written.

## Project board

```bash
item=$(gh project item-add 34 --owner yokesh-ks \
  --url https://github.com/$R/issues/<n> --format json --jq .id)
set_field() {  # set_field <field id> <option id>
  gh project item-edit --id "$item" --project-id PVT_kwHOBAdtHM4BpdXc \
    --field-id "$1" --single-select-option-id "$2"
}

# Status: Backlog for an epic before refinement and for a story with an
# open blocker; Todo for a refined story with none.
open_blockers=$(gh api repos/$R/issues/<n>/dependencies/blocked_by \
  --jq '[.[] | select(.state=="open")] | length')
if [ "<epic or story>" = story ] && [ "$open_blockers" = 0 ]; then
  set_field PVTSSF_lAHOBAdtHM4BpdXczhn47Y8 f75ad846   # Todo
else
  set_field PVTSSF_lAHOBAdtHM4BpdXczhn47Y8 fdb23e39   # Backlog
fi

# Phase from the issue's milestone ("Phase <n> — …"); option ids in the table above
set_field PVTSSF_lAHOBAdtHM4BpdXczhn6_0w <phase option id>
# Stories only: Priority and Size matching their P* and size:* labels
set_field PVTSSF_lAHOBAdtHM4BpdXczhn6_y8 <priority option id>
set_field PVTSSF_lAHOBAdtHM4BpdXczhn6_0o <size option id>
```

`item-add` is idempotent: adding an issue already on the board returns its
existing item id.
