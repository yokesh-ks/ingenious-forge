---
epic: "#3 — Epic: Agent skills for planning and feature delivery"
date: 2026-10-31
verdict: "rejected"
---

# Retrospective: Agent skills for planning and feature delivery

**Epic:** #3
**Date:** 2026-10-31
**Verdict:** **rejected**

## Summary

Epic #3 set out to give every agent a skill for each feature delivery
stage, from principles and roadmap through verification, review,
integration, release and retrospective. All 13 sub-issues closed through
11 merged PRs (#28–#50) between 2026-10-30 and 2026-10-31: the
Principles section, 11 new skills and the feature delivery flow. Every
skill passes `check-skill.sh` with 0 errors and `scripts/check-all.sh`
passes. The verdict is **rejected** only because two items of the
epic's per-skill definition of done are unmet for some skills: four
skills have no recorded with/without-skill scenario test, and
`release-launch` breaks the description rule. Each gap is small and
listed as an action item.

## Evidence inventory

| Evidence | Status | Notes |
| --- | --- | --- |
| Epic issue | ✓ | #3, closed 2026-10-31T10:29Z |
| Sub-issues | ✓ 13 closed, 0 open | #4–#15 planned; #33 added mid-epic |
| Merged PRs | ✓ 13 found | every sub-issue has a closing PR (`closedByPullRequestsReferences`) |
| Review threads | partial | automated reviewer on 11 of 13 PRs; none on #28 and #29 |
| ADRs | ✓ 1 added | `0001-record-architecture-decisions.md`, still **Proposed** |
| Verification blocks | partial | present in #38, #41, #44, #45, #49, #50; absent from #29, #30, #31 |
| Scenario tests (DoD) | partial | 7 of 11 skill PRs; none in #44, #45, #46, #49 |
| Plan-analysis reports | none | `output/planning/` holds only skill test fixtures |
| Re-plans | partial | #33 added with a written reason; #14 un-deferred with no recorded decision |
| Behaviour check | ✓ | skill scripts and checks run on `main` at the time of writing (see below) |

## What went well

- Every planned skill shipped with its symlink, licence, `NOTICE` entry
  and `AGENTS.md` registration: `check-skill.sh` reports 0 errors across
  all 13 skills.
- `skill-intake` (#29) shipped first and its red/green scenario method
  was reused by #30, #31, #32, #34, #38 and #41, as the epic's suggested
  order intended.
- The automated reviewer caught real defects before merge, and each was
  fixed on the PR branch: ADR 0001 self-marked Accepted (#31, fixed in
  4d1fd3f), a copy-paste break in `AGENTS.md` (#32), an undefined
  `$BASE` and hardcoded `main` in `branch-finishing` (#44, fixed in
  d7b854c, 587dfb4, 599de05), and invalid `gh` commands in the
  retrospective evidence guide (#45, fixed in 6b129d4).
- The AI attribution rule was caught in practice: #41's PR body carried
  a "Generated with" line, it was flagged in review and removed before
  merge, and `check-pr-body.sh` then passed (#41 thread on `AGENTS.md:200`).
- Scope stayed out of the product: no PR in the epic modified
  `docs/PRD.md`.

## What didn't go well

- Four skill PRs merged without the scenario test that the epic's
  definition of done requires: #44 (`branch-finishing`), #45
  (`retrospective`), #46 (`address-pr-comments`) and #49
  (`release-launch`). #45 and #46 list the runtime check as an
  unchecked "Test plan" item.
- `branch-finishing` drew 36 inline review comments over 4 commits
  (#44), mostly placeholder and hardcoded-value bugs in shell snippets,
  the kind a scenario run would have surfaced before review.
- #41's PR body was opened with the agent harness's default "Generated
  with" attribution line, despite Principle VII. Review caught it (#41 thread on
  `AGENTS.md:200`), so the guardrail worked, but the agent wrote the
  violation in the first place.
- #14 said "deferred … not now", but `release-launch` was built in the
  same epic (#49) with no `Decision:` line explaining the change.

## Findings

### Delivery

- Planned 12 sub-issues (#4–#15); delivered 13. #33
  (`address-pr-comments`) was added on 2026-10-30T16:33Z with a written
  split from `change-review` (#33 "Split from `change-review` (#11)").
- #14 (`release-launch`) was planned as deferred to Phase 0/1 but
  delivered in #49. No decision is recorded on #14 or #3.
- Merge order mostly followed the suggested order; `retrospective` (#45)
  merged before the delivery flow (#50), as planned.

### Quality

Recurring review themes across #30–#50 (automated reviewer, 157 inline
comments across both epics):

- **Hardcoded values and placeholders in shell snippets**: #44
  (`origin/main`, board IDs, `<n>`, `<short SHA>`), #45
  (`<owner/repo>`, merge-base placeholders), #49 (hardcoded repository,
  `LAST_TAG_DATE` unset, GNU-only `date`).
- **Portability**: #49 GNU `date` syntax; #37 `wc -m`.
- **Self-consistency with Forge's own rules**: #31 ADR status, #41 AI
  attribution, #50 inconsistent "Small bug fix" entry point between
  `AGENTS.md` and `docs/feature-delivery.md` (fixed in 97842a8).
- No post-merge bugs were filed against the epic's skills.

Definition-of-done items checked against `main` at the time of writing:

- `SKILL.md` under ~300 lines: `branch-finishing` is 381 lines and
  `release-launch` 409 (`check-skill.sh` warnings).
- Description "says only when to use it ('Use when …') and never
  summarises the workflow": `release-launch` starts "Use before
  publishing…" and goes on to list its steps.

### Spec alignment

- The epic builds process tooling, not product features. No change to
  `docs/PRD.md`, and `README.md` dropped its "verification-first"
  wording in #52 (epic #16).
- ADR 0001 (#31) remains **Proposed** in
  [`0001-record-architecture-decisions.md`](../decisions/0001-record-architecture-decisions.md).
  ADRs are already in use, so the record and practice have drifted until
  the maintainer accepts it.

### Process

- **Helped:** `skill-intake`'s check script made the per-skill DoD
  mechanical (CI job `skills`); the red/green method caught problems on
  the PRs that used it (#38 lists six scenarios S1–S6).
- **Helped:** review replies on #39–#52 follow one form ("Fixed in
  <sha>" or "No change: <reason>"), which made each thread's outcome
  traceable to a commit.
- **Friction:** the scenario step was dropped on the four skills merged
  last (#44, #45, #46, #49, all on 2026-10-31). The DoD had no machine
  check for it.
- **Friction:** this retrospective is the first runtime use of the
  `retrospective` skill (the dry run #45's test plan calls for). Its
  evidence commands worked, but `gh pr list --search "Closes #N"`
  is not needed: `closedByPullRequestsReferences` on each issue gave the
  PR links directly.

### Behaviour check

Run on `main` (d79688f) at the time of writing:

- `bash scripts/check-all.sh` → `check-all: all checks passed (pr-body skipped)`.
- `bash .agents/skills/skill-intake/scripts/check-skill.sh` → `Errors: 0  Warnings: 5`
  (2 for vendored `adhd` and `agent-sop`; 3 listed above).
- The `retrospective` skill was run end to end on this epic; its output
  is this document.

## Verdict

| Criterion (epic #3, DoD for every skill task) | Evidence | Met? |
| --- | --- | --- |
| Skill at `.agents/skills/<name>/SKILL.md` | `check-skill.sh` 0 errors | yes |
| `.claude/skills/<name>` symlink | `check-skill.sh` | yes |
| `name` matches folder; description "Use when …", no workflow summary | `release-launch/SKILL.md:3` starts "Use before" and lists steps | partial |
| `SKILL.md` under ~300 lines | `branch-finishing` 381, `release-launch` 409 | partial |
| Forge paths and conventions | `check-all.sh` links check, reviews on #44/#45 fixed | yes |
| Upstream `LICENSE`, `license:` field, `NOTICE` entry | `check-skill.sh` | yes |
| Listed in `AGENTS.md` | `check-skill.sh` | yes |
| Scenario test without/with the skill, noted in PR | missing in #44, #45, #46, #49 | no |
| Conventional titles, no AI attribution | `check-all.sh` commits job; #41 body fixed before merge | yes |
| No competitor names in `docs/PRD.md` | `check-prd-names.sh` ok | yes |
| Principles in `AGENTS.md` (#4) and delivery flow (#15) | #28, #50 | yes |

**Verdict: rejected**

Reasons:

1. Four skills (`branch-finishing`, `retrospective`,
   `address-pr-comments`, `release-launch`) have no recorded
   with/without-skill scenario test.
2. `release-launch`'s description breaks the description rule, and two
   skills exceed the ~300-line guide.

Every other criterion is met. Closing action items 1–3 would make the
epic acceptable.

## Action items

| # | Type | Description | Owner | Status |
| --- | --- | --- | --- | --- |
| 1 | fix | Run and record red/green scenario tests for `branch-finishing`, `retrospective`, `address-pr-comments` and `release-launch` → #53 | maintainer / agent | approved |
| 2 | fix | Rewrite `release-launch` description to "Use when …" without the workflow summary → #54 (with item 3: same file) | agent | approved |
| 3 | fix | Move heavy material in `branch-finishing` and `release-launch` `SKILL.md` into `references/` to get under ~300 lines → #54 | agent | approved |
| 4 | instruction | `skill-intake` step 9: summarise results under a `## Scenarios` PR heading; `check-pr-body.sh` fails a `feat(skills):` PR without it (keyed on the title, not the `area:skills` label, because PR labels are not always applied) → #59 | maintainer | approved |
| 5 | instruction | `branch-finishing` step 6d: run `scripts/check-pr-body.sh` on the body before `gh pr create`, which catches harness-supplied attribution (the #41 case) → #59 | agent | approved |
| 6 | decision | ADR 0001 accepted by the maintainer on 2026-10-31 → #59 | maintainer | approved |
| 7 | instruction | `Decision:` comment on #14: built early to complete the delivery skill set in one epic → #59 | maintainer | approved |
