# Project board

[Project 34, IngeniousForge](https://github.com/users/yokesh-ks/projects/34)
is the single view of all Forge work. Every issue and pull request in
`yokesh-ks/ingenious-forge` is on it. This page records its configuration
so it can be rebuilt from scratch, and lists the `gh` commands agents use.

## Status

| Status | Meaning | Entered by |
|---|---|---|
| **Backlog** | Captured, not yet planned or refined | Workflow: item added |
| **Todo** | Refined and ready to start; dependencies met | Maintainer or `roadmap-planning` |
| **In Progress** | Claimed: assigned and a branch exists | Agent at `workspace-setup` |
| **In Review** | PR open, waiting for review and maintainer approval | Workflow: PR linked to issue |
| **Done** | Merged or closed | Workflow: item closed, PR merged |

An item moves forward only. Reopening sends it back to **Todo**. An agent
sets **In Progress** itself when it claims an issue; the other moves are
made by the workflows below or by the maintainer.

## Fields

| Field | Type | Options | Notes |
|---|---|---|---|
| Status | Single select | Backlog, Todo, In Progress, In Review, Done | Built-in field, options as above |
| Priority | Single select | P0, P1, P2 | Mirrors the `P0`–`P2` labels, so views can sort by it |
| Size | Single select | XS, S, M, L | Mirrors the `size:*` labels; L means split it first |
| Phase | Single select | 0 Foundation, 1 MVP, 2 v1.0, 3 Board, 4 Cloud | Phases of PRD §9; process and skills work is 0 Foundation |

Built-in fields used by the views: Assignees, Labels, Milestone, Parent
issue, Sub-issues progress, Linked pull requests.

When an issue has a priority or size label, set the matching field to the
same value. The label is what triage applies; the field is what the board
sorts on.

## Views

| # | Name | Layout | Filter | Group by | Fields shown |
|---|---|---|---|---|---|
| 2 | Board | Board | `-closed:<@today-14d` | Status (columns) | Title, Assignees, Status, Linked pull requests, Sub-issues progress |
| 3 | Roadmap | Table | none | Phase; sort by Parent issue | Title, Assignees, Status, Phase, Parent issue, Sub-issues progress, Priority, Size |
| 4 | Epics | Table | `label:epic` | none | Title, Assignees, Status, Phase, Milestone, Sub-issues progress |
| 5 | In flight | Table | `status:"In Progress","In Review"` | Assignees | Title, Assignees, Status, Linked pull requests, Priority, Size |
| 6 | Blocked | Table | `label:blocked` | none | Title, Assignees, Status, Labels, Priority, Size |

Notes on the filters, checked on the live board on 2026-10-30:

- `-closed:<@today-14d` shows open items plus items closed in the last 14
  days, so the Done column does not grow forever.
- A table can group by one field only, so Roadmap groups by Phase and
  sorts by Parent issue. Sub-issues also show nested under their parent.
- The filter bar cannot combine two qualifiers with "or". `label:blocked`
  shows items blocked by something outside GitHub; `is:blocked` shows
  items with an open blocking issue. Type `is:blocked` in the Blocked
  view's filter bar to see the second set.

## Workflows

Set under the project's **⋯ → Workflows**. Every workflow below is turned
on.

| Workflow | Setting |
|---|---|
| Item added to project | Set Status to **Backlog** |
| Item reopened | Set Status to **Todo** |
| Pull request linked to issue | Set Status to **In Review** |
| Pull request merged | Set Status to **Done** |
| Item closed | Set Status to **Done** |
| Auto-add to project | Repository `yokesh-ks/ingenious-forge`, filter `is:issue,pr is:open` |
| Auto-add sub-issues to project | Default |
| Auto-close issue | Default (closes the issue when its Status becomes Done) |

GitHub Actions automation beyond these workflows is out of scope.

## Rebuild from scratch

Fields and views can be created with `gh`. Grouping, sorting and
workflows can only be set in the web UI.

```bash
P=$(gh project view 34 --owner yokesh-ks --format json --jq .id)
STATUS=$(gh project field-list 34 --owner yokesh-ks --format json \
  --jq '.fields[] | select(.name=="Status") | .id')

# 1. Status options. Pass the existing option ids so items keep their status.
gh api graphql -f query="mutation { updateProjectV2Field(input:{fieldId:\"$STATUS\", singleSelectOptions:[
  {name:\"Backlog\", color:GRAY, description:\"Captured, not yet planned or refined\"},
  {id:\"<todo id>\", name:\"Todo\", color:GREEN, description:\"Refined and ready to start; dependencies met\"},
  {id:\"<in progress id>\", name:\"In Progress\", color:YELLOW, description:\"Claimed: assigned and a branch exists\"},
  {name:\"In Review\", color:BLUE, description:\"PR open, waiting for review and maintainer approval\"},
  {id:\"<done id>\", name:\"Done\", color:PURPLE, description:\"Merged or closed\"}]}) { clientMutationId } }"

# 2. Custom fields
gh project field-create 34 --owner yokesh-ks --name Priority \
  --data-type SINGLE_SELECT --single-select-options "P0,P1,P2"
gh project field-create 34 --owner yokesh-ks --name Size \
  --data-type SINGLE_SELECT --single-select-options "XS,S,M,L"
gh project field-create 34 --owner yokesh-ks --name Phase \
  --data-type SINGLE_SELECT \
  --single-select-options "0 Foundation,1 MVP,2 v1.0,3 Board,4 Cloud"

# 3. Views. visible_fields takes the numeric field ids from the fields endpoint.
H="X-GitHub-Api-Version: 2026-03-10"
gh api -H "$H" /users/yokesh-ks/projectsV2/34/fields --jq '.[] | "\(.id) \(.name)"'
gh api -X POST -H "$H" /users/yokesh-ks/projectsV2/34/views \
  -f name="In flight" -f layout=table -f filter='status:"In Progress","In Review"' \
  -F 'visible_fields[]=<title id>' -F 'visible_fields[]=<assignees id>'
```

The views API creates a view but cannot change or delete one. Fix a
view's filter, grouping or sorting in the web UI, then **Save**.

Then in the web UI:

1. For each view, set the group by and sort from the Views table.
2. Set each workflow as in the Workflows table and turn it on.
3. Delete the default "View 1" if it is still there.

## Commands for agents

Every write needs the maintainer's approval in chat, except an agent
setting its own claimed issue to **In Progress** at `workspace-setup`.

| Name | Id |
|---|---|
| Project | `PVT_kwHOBAdtHM4BpdXc` |
| Status field | `PVTSSF_lAHOBAdtHM4BpdXczhn47Y8` |
| Status options | Backlog `fdb23e39`, Todo `f75ad846`, In Progress `47fc9ee4`, In Review `011a42ee`, Done `98236657` |
| Priority field | `PVTSSF_lAHOBAdtHM4BpdXczhn6_y8` |
| Priority options | P0 `d08c3f9a`, P1 `75517596`, P2 `2b0747d7` |
| Size field | `PVTSSF_lAHOBAdtHM4BpdXczhn6_0o` |
| Size options | XS `58c8132b`, S `ecae9bfa`, M `42f7c129`, L `0b773a21` |
| Phase field | `PVTSSF_lAHOBAdtHM4BpdXczhn6_0w` |
| Phase options | 0 Foundation `33879dff`, 1 MVP `89b5dcfa`, 2 v1.0 `92a79d08`, 3 Board `802b4bb6`, 4 Cloud `f19a827e` |

The ids were read on 2026-10-30. They change only if a field is
recreated. If a command fails with an unknown id, read them again and
update this table:

```bash
gh project field-list 34 --owner yokesh-ks --format json
```

```bash
R=yokesh-ks/ingenious-forge
P=PVT_kwHOBAdtHM4BpdXc

# Add an issue or PR (idempotent: returns the existing item id if already on the board)
item=$(gh project item-add 34 --owner yokesh-ks \
  --url https://github.com/$R/issues/<n> --format json --jq .id)

# Find the item id of an issue already on the board
item=$(gh project item-list 34 --owner yokesh-ks --format json --limit 500 \
  --jq '.items[] | select(.content.number==<n>) | .id')

# Set Status (here In Progress)
gh project item-edit --project-id $P --id "$item" \
  --field-id PVTSSF_lAHOBAdtHM4BpdXczhn47Y8 --single-select-option-id 47fc9ee4

# Set Priority, Size or Phase (here Size M)
gh project item-edit --project-id $P --id "$item" \
  --field-id PVTSSF_lAHOBAdtHM4BpdXczhn6_0o --single-select-option-id 42f7c129

# Read an item's status and fields
gh project item-list 34 --owner yokesh-ks --format json --limit 500 \
  --jq '.items[] | select(.content.number==<n>) | {status, priority, size, phase}'
```
