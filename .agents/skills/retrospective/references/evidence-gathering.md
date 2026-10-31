# Evidence gathering

Commands and patterns for Phase 2 (Gather). Run these from the
repository root. Replace `<N>` with the epic issue number and
`<owner/repo>` with the GitHub repository.

## Epic and sub-issues

```bash
# The epic itself
gh issue view <N> --json title,body,state,labels,milestone,closedAt

# Sub-issues (issues whose body contains "Part of #<N>" or that are
# linked from the epic body). GitHub search has no `linked:issue:` qualifier,
# so search for the epic number and filter client-side for issues that
# reference it (or traverse sub-issue relationships with the GraphQL API).
gh issue list --search "#<N>" --json number,title,state,labels,body --limit 200
```

For each sub-issue, extract its acceptance criteria (lines starting
with `- [ ]` or `- [x]` under a heading containing "Acceptance" or
"Done when").

## Linked PRs

```bash
# PRs that mention "Closes #<N>", "Fixes #<N>" or "Refs #<N>" for the
# epic or any sub-issue
gh pr list --search "Closes #<N> OR Fixes #<N> OR Refs #<N>" --state merged --json number,title,url,mergedAt,body --limit 200

# For each sub-issue number <M>:
gh pr list --search "Closes #<M> OR Fixes #<M> OR Refs #<M>" --state merged --json number,title,url,mergedAt,body --limit 200
```

De-duplicate by PR number across all queries.

## Review threads

For each merged PR:

```bash
# PR review comments (inline code review)
gh api repos/<owner/repo>/pulls/<pr>/comments --paginate

# PR reviews (top-level review bodies)
gh api repos/<owner/repo>/pulls/<pr>/reviews --paginate
```

Extract recurring themes: group comments by the type of issue they
raise (naming, missing test, spec drift, style, etc.).

## Combined diff

Find the merge-base of the first and last merged PR to get the full
change range:

```bash
# Collect merge SHAs (from the PR list above) and sort by date
# First merge commit — copy the merge commit SHA from the PR list output
FIRST_SHA=<earliest merged PR's merge commit>
# Current HEAD of main
LAST_SHA=$(git rev-parse origin/main)

# Full diff stats — diff directly between the first and last merge commits
# so only the epic's changes are shown (not pre-epic history)
git diff --stat $FIRST_SHA..$LAST_SHA

# Full diff for analysis (pipe to a file if large)
git diff $FIRST_SHA..$LAST_SHA
```

## ADRs

```bash
# ADRs whose commits fall in the epic's range
git log --name-only --pretty=format: -- docs/decisions/ \
  | grep -v '^$' | sort -u

# Check each ADR's status field for "superseded"
```

## Plan-analysis reports and verification blocks

Search PR bodies for verification blocks:

```bash
# For each merged PR number <pr>:
gh pr view <pr> --json body --jq '.body' | grep -A 20 "Verification"
```

Search for `plan-analysis` output files if they exist:

```bash
# Create a timestamp file for the epic's start date first:
# touch -d "<epic-start-date>" /tmp/epic-start
find output/planning/ -name "*.md" -newer /tmp/epic-start 2>/dev/null
```

## Re-plans

Search the epic and sub-issues for decision lines:

```bash
# In the epic body and comments — extract body first, then grep
gh issue view <N> --json body,comments --jq '.body + "\n" + (.comments[].body // "")' | grep -i "decision\|re-plan\|scope change\|dropped\|added"
```

## Recording gaps

For every evidence type above, if the query returns nothing or an item
is missing its expected artifact, record it in the inventory:

```text
Evidence inventory
- Epic #<N>: ✓ found
- Sub-issues: ✓ 5 found, 1 open (list)
- PRs: ✓ 4 merged, story #12 has no linked PR ← gap
- Review threads: ✓ found for PRs #20, #21; none for #22 ← gap
- ADRs: ✓ 1 added (0004-...)
- Verification blocks: ✓ found in PRs #20, #21
- Re-plans: none found
- Behaviour: no runtime changes in this epic
```

A reader must be able to tell "checked and found nothing" from "never
checked".
