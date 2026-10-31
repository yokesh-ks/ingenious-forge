# Feature delivery flow

Every feature in Ingenious Forge follows this staged flow. Each stage names
its skill, the output it produces, and the human gate that must be cleared
before the next stage begins.

| Stage | Skill | Output | Human gate |
|---|---|---|---|
| Product plan | `roadmap-planning` | Milestones, epics and stories on project 34; `docs/ROADMAP.md` | Approve breakdown |
| Explore | `adhd` | Shortlist | Pick direction |
| Decide | `decision-records` | `docs/decisions/NNNN-*.md` | Accept ADR |
| Spec, design and plan | `agent-sop` → `pdd` | `output/planning/<project>/` | Approve spec and design |
| Tasks | `agent-sop` → `code-task-generator` | `output/tasks/<project>/` | — |
| Check plan | `plan-analysis` | `analysis.md` | Resolve CRITICAL findings |
| Workspace | `workspace-setup` | Branch or worktree, baseline | Worktree consent |
| Build | `agent-sop` → `code-assist` | Code and tests | — |
| Verify | `verify-before-done` | Evidence block | — |
| Review | `change-review` | Findings and verdict | Approve PR |
| Integrate | `branch-finishing` | PR or merge | Choose option, merge |
| Release | `release-launch` | Tagged release | Approve publish |
| Learn | `retrospective` | `docs/retrospectives/…` | Approve action items |

## Entry points

Choose the entry point that matches the work at hand:

- **New product area**: start at `roadmap-planning` to break the PRD into
  milestones, epics and stories; then use `decision-records` for stack
  decisions, and `pdd` for the first story.
- **Clear story**: start at `pdd` or `code-task-generator` if the story is
  already well-defined and linked to an issue.
- **Small bug fix**: start at `workspace-setup`; skip the planning stages
  (Spec, Tasks, Check plan); run Build → Verify → Review → Integrate as normal.
- **Docs-only change**: start at `workspace-setup`; skip planning; run
  Verify → Review → Integrate.

## Non-skippable stages

These two stages apply to every change that reaches `main`:

- **`verify-before-done`** — required before any completion claim,
  before committing, opening a PR, or closing an issue.
- **`branch-finishing`** — required for every change that reaches `main`.
