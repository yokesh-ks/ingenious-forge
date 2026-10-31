#!/bin/sh
# Check a pull request's title and body. POSIX sh. CI job: pr-body.
#
#   - the title is a conventional commit title (squash merges use it);
#   - the body has no AI attribution (.githooks/ai-attribution-patterns.txt);
#   - the body links an issue (Closes/Fixes/Resolves/Refs #N), unless the
#     PR has the chore label and its title starts with chore: or docs:;
#   - a feat(skills): PR has a "Scenarios" heading (skill-intake step 9);
#   - the head branch, when given, is <type>/<short-kebab-slug>[-<issue>].
#
# Usage: scripts/check-pr-body.sh <title> <body-file> [<labels> [<head-branch>]]
#   <labels> is a comma-separated list of label names.
# Locally, for an open PR:
#   gh pr view N --json body -q .body >/tmp/body
#   scripts/check-pr-body.sh "$(gh pr view N --json title -q .title)" /tmp/body \
#     "$(gh pr view N --json labels -q '[.labels[].name] | join(",")')" \
#     "$(gh pr view N --json headRefName -q .headRefName)"

root=$(cd "$(dirname "$0")/.." && pwd)
FORGE_HOOKS_DIR=$root/.githooks
# shellcheck source-path=SCRIPTDIR source=../.githooks/lib/checks.sh
. "$FORGE_HOOKS_DIR/lib/checks.sh"

if [ $# -lt 2 ] || [ ! -r "$2" ]; then
	echo "usage: $0 <title> <body-file> [<labels> [<head-branch>]]" >&2
	exit 2
fi
title=$1
body=$(cat "$2")
labels=,${3:-},
head=${4:-}
rc=0

forge_check_title "$title" || rc=1

hits=$(forge_attribution_hits "$body") || rc=1
if [ -n "$hits" ]; then
	forge_err "AI attribution is not allowed in the PR body:"
	printf '%s\n' "$hits" | while IFS= read -r line; do
		forge_err "  > $line"
	done
	forge_err "  Remove these lines (AGENTS.md Principle VII)."
	rc=1
fi

if ! printf '%s\n' "$body" |
	grep -Eiq '(closes?|closed|fixes?|fixed|resolves?|resolved|refs?) +([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#[0-9]+'; then
	case $labels:$title in
	*,chore,*:chore:* | *,chore,*:chore\(* | *,chore,*:docs:* | *,chore,*:docs\(*) ;;
	*)
		forge_err "the PR body links no issue: add \"Closes #N\", \"Fixes #N\" or \"Refs #N\""
		forge_err "  (exempt only with the chore label and a chore: or docs: title)"
		rc=1
		;;
	esac
fi

case $title in
feat\(skills\):* | feat\(skills\)!:*)
	if ! printf '%s\n' "$body" | grep -Eiq '^#{1,6} +scenarios?([^a-z]|$)'; then
		forge_err "a feat(skills): PR needs a \"## Scenarios\" section with red/green results"
		forge_err "  (skill-intake steps 4 and 9)"
		rc=1
	fi
	;;
esac

if [ -n "$head" ]; then
	forge_check_branch_name "$head" || rc=1
fi

[ $rc -eq 0 ] && echo "pr-body: ok"
exit $rc
