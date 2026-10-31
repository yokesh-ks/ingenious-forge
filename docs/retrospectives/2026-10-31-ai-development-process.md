---
epic: "#16 — Epic: AI development process: tracking, guardrails and multi-agent setup"
date: 2026-10-31
verdict: "rejected"
---

# Retrospective: AI development process: tracking, guardrails and multi-agent setup

**Epic:** #16
**Date:** 2026-10-31
**Verdict:** **rejected**

## Summary

Epic #16 set out to turn Forge's development process into something
tracked (labels, issue forms, project board), enforced (git hooks, CI,
`main` ruleset, agent permissions and hooks) and portable across coding
agents (adapter guide, working agreements, `CONTRIBUTING.md`). All 11
tasks closed through 11 merged PRs (#35–#52) on 2026-10-30 and
2026-10-31, and the guardrails work: hook tests pass 35/35, all CI
checks pass, and the `main` ruleset is active. The verdict is
**rejected** because the closing dry run (C3) left its two findings
neither fixed nor filed and did not reach a merged PR. In addition, two
CRITICAL review findings in the CI scripts (#39) were never answered and
are still reproducible.

## Evidence inventory

| Evidence | Status | Notes |
| --- | --- | --- |
| Epic issue | ✓ | #16, closed 2026-10-31T11:53Z |
| Sub-issues | ✓ 11 closed, 0 open | #17–#27 |
| Merged PRs | ✓ 11 found | every sub-issue has a closing PR (`closedByPullRequestsReferences`) |
| Review threads | ✓ | automated reviewer on all 11 PRs; #48 had 5 bot reviews and 106 inline comments |
| ADRs | none | no ADR added for the hook library, CI design or ruleset |
| Verification blocks | ✓ | present in every PR except #35 and #36 |
| Plan-analysis reports | none | issues served as the spec (Principle II allows a GitHub issue) |
| Re-plans | none | no `Decision:` lines on #16 or its tasks |
| Behaviour check | ✓ | hooks, checks and ruleset exercised at the time of writing (see below) |

## What went well

- Guardrails are layered as designed: the same `.githooks/lib/checks.sh`
  serves the local hooks (#37), CI (#39, refactored in ee869ab) and the
  agent hooks (#48), so a rule changes in one place.
- The AI attribution and conventional-title rules are machine-checked
  locally and in CI, and the dry run showed both blocking a real commit
  ([`dry-run-2026-10-31.md`](../process/dry-run-2026-10-31.md) step 5a).
- Configuration GitHub forces into the UI is recorded as code: the
  ruleset JSON (#42, matched to the applied ruleset in afe8ad8) and the
  board fields and IDs (#40).
- Review caught real bugs before merge: a broken shell conditional that
  always set Backlog (#40, fixed in d1204eb and tested on #3, #11, #19),
  the missing `FORGE_ALLOW_MAIN` override in `main-guard.sh` and missed
  combined `-n` flags in `bypass-guard.sh` (#48, fixed in 163ab53 and
  438cd21).
- Reasoned pushback was recorded rather than silently ignored: #40
  kept the board statuses with a note separating the GitHub board from
  the PRD §6.3 product board (6c0a2f4).

## What didn't go well

- The dry run (#52) left its two findings, the intermittent
  `main-guard.sh` false positive in worktrees and the skipped separate
  `change-review`, as "tracked as a known friction" with no issue filed
  ([`dry-run-2026-10-31.md`](../process/dry-run-2026-10-31.md) § Findings).
- The dry run's step 1 says #27 "was filed using the Story form", but
  #27 was created at 2026-10-30T14:36Z and the forms merged at 18:06Z
  (#36). Step 3 marks the workspace ✅ on branch
  `claude/github-issue-27-f9ae37`, which breaks the branch convention.
- Two CRITICAL findings on #39 have no reply and are unfixed (see
  Quality).
- #48 needed 5 automated review rounds. The bot raised Principle VI 17
  times and Principle I/II 6 times; the maintainer account answered the
  same scope argument each time. The principles do not say whether they
  cover process tooling.
- 13 of the 19 PRs opened after the branch convention existed (#30,
  merged 2026-10-30T16:11Z) used the agent harness's
  `claude/github-issue-N-<hash>` names instead of
  `<type>/<slug>-<issue>`: #35–#38, #42–#48, #51, #52.

## Findings

### Delivery

- All 11 planned tasks delivered; none added or dropped.
- Order mostly followed the plan. B4 (#42, ruleset) merged after CI
  (#39) as required. A3 (#40) merged before B2 (#39) and as a merge
  commit (17ce9c3), which was still allowed before the ruleset.
- PRs #28–#40 merged before the ruleset and without required checks;
  #37, #38 and #40 landed as merge commits.

### Quality

Recurring review themes (automated reviewer, epic #16 PRs):

- **Shell edge cases**: #37 `wc -m` portability and pattern-file
  parsing, #39 range fallbacks and link parsing, #48 `-n` flag
  detection and full-command matching.
- **Redundant or missing permission rules**: #43 (7 warnings, fixed in
  ecf2e26).
- **Principle scope disputes**: #40 (PRD §6.3 statuses), #48
  (Principles I, II, VI).

Unresolved findings, reproduced on `main` (d79688f):

- `scripts/check-commits.sh:20`: when `origin/main` is missing,
  `git merge-base HEAD "$(git rev-parse HEAD)"` is HEAD itself, so the
  range is empty and the check passes vacuously. Reproduced: `merge-base
  HEAD HEAD == HEAD? yes`, `commits in that fallback range: 0`. CI always
  passes an explicit range (`repo-hygiene.yml:39–54`), so only local
  runs without a fetched `origin/main` are affected. Raised as CRITICAL
  on #39, no reply.
- `scripts/check-links.mjs:61`: only the first line of an indented code
  block is skipped. Reproduced: a two-line indented block reports
  `[ [ 4, 'missing-two.md' ] ]`, a false positive. Raised as CRITICAL on
  #39, no reply.

### Spec alignment

- Process tooling only; no PR changed `docs/PRD.md`. PRD §6.3 (Forge
  Board columns) intentionally differs from the GitHub project board
  statuses; the difference is documented in
  [`project-board.md`](../process/project-board.md).
- Definition-of-done item "`main` can't be pushed to directly" holds,
  but the ruleset's admin bypass (`RepositoryRole` 5, mode
  `pull_request`) lets an admin merge a PR whose required checks fail,
  and `required_approving_review_count` is 0.
  [`branch-protection.md`](../process/branch-protection.md) records both
  as deliberate single-maintainer choices, but does not say the bypass
  also skips required checks.

### Process

- **Helped:** "agent-agnostic first" made portability cheap: the
  Claude Code hooks are thin wrappers over `checks.sh`, and
  [`agent-adapters.md`](../process/agent-adapters.md) records a
  completed Claude Code checklist.
- **Helped:** `scripts/check-all.sh` mirrors CI, so the PRs could cite
  local proof before pushing.
- **Friction:** the automated reviewer re-raised declined findings on
  each push (#48), creating review noise. It has no record of
  maintainer decisions.
- **Friction:** the agent harness picks its own branch names, so the
  convention was not followed and no hook or CI check enforces it.

### Behaviour check

Run on `main` (d79688f) at the time of writing:

- `bash scripts/test-hooks.sh` → `35 passed, 0 failed`.
- `bash scripts/check-all.sh` → `check-all: all checks passed (pr-body skipped)`.
- `gh api repos/yokesh-ks/ingenious-forge/rulesets/<id>` → `main
  protection`, `enforcement=active`, rules `deletion`,
  `non_fast_forward`, `required_linear_history`, `pull_request`,
  `required_status_checks` (all seven CI checks), merge methods
  `squash`, `rebase`.
- The `check-commits.sh` and `check-links.mjs` reproductions above.

## Verdict

| Criterion (epic #16 definition of done) | Evidence | Met? |
| --- | --- | --- |
| All 11 tasks closed | #17–#27 closed, each by a PR | yes |
| A new contributor can follow `CONTRIBUTING.md` from issue to merged PR | `CONTRIBUTING.md` (#52); dry run stopped before merge (step 10 deferred) and step 1 is inaccurate | partial |
| AI attribution / non-conventional titles rejected locally and in CI | `test-hooks.sh` 35/35; `commits` and `pr-body` CI jobs; dry run step 5a | yes |
| `main` can't be pushed to directly | ruleset active with `pull_request` and `non_fast_forward` | yes |
| Adapter checklist exists and Claude Code passes it | `agent-adapters.md` § Add-an-agent checklist and § Claude Code — completed checklist | yes |
| C3 dry run complete, findings fixed or filed | 2 findings neither fixed nor filed; merge step not run | no |

**Verdict: rejected**

Reasons:

1. The dry run's findings were neither fixed nor filed, and the dry run
   did not reach a merged PR.
2. Two CRITICAL review findings on #39 are unanswered and still
   reproduce.

Action items 1–4 would close both.

## Action items

| # | Type | Description | Owner | Status |
| --- | --- | --- | --- | --- |
| 1 | fix | `main-guard.sh` worktree false positive found in the dry run → #55 | agent | approved |
| 2 | fix | Fix `check-commits.sh` fallback to use `HEAD^!` when `origin/main` is missing → #56 | agent | approved |
| 3 | fix | Fix `check-links.mjs` to skip every line of an indented code block, not just the first → #57 | agent | approved |
| 4 | fix | Correct `dry-run-2026-10-31.md` steps 1 and 3, and record the merge step now that #52 is merged → #58 | agent | approved |
| 5 | instruction | Principles I and II govern the Forge product and application code; process tooling traces to an issue (MINOR, 1.1.0, separate `docs(principles):` PR) → #59 | maintainer | approved |
| 6 | instruction | Branch convention enforced: `workspace-setup` renames harness-made branches before the first push, and the `pr-body` check rejects other names → #59 | maintainer | approved |
| 7 | instruction | `branch-protection.md`: say that the admin bypass also lets an admin merge with failing checks → #59 | agent | approved |
| 8 | instruction | `REVIEW.md` (the automated reviewer's guidance): do not re-raise a finding answered "No change: <reason>" on unchanged lines; apply the Principle I/II scope → #59 | maintainer | approved |
| 9 | instruction | Working agreements: separate-session `change-review` for application code; automated reviewer plus maintainer review for process, skill and docs PRs → #59 | maintainer | approved |
