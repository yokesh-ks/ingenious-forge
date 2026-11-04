#!/bin/sh
# Check every commit in a range with the shared hook checks: conventional
# title and no AI attribution. POSIX sh. CI job: commits.
#
# Usage: scripts/check-commits.sh [<range>]   (default: origin/main..HEAD)
# FORGE_CHECK_REPO checks another repository (used by test-hooks.sh).

root=$(cd "$(dirname "$0")/.." && pwd)
FORGE_HOOKS_DIR=$root/.githooks
# shellcheck source-path=SCRIPTDIR source=../.githooks/lib/checks.sh
. "$FORGE_HOOKS_DIR/lib/checks.sh"

repo=${FORGE_CHECK_REPO:-$root}

if [ $# -ge 1 ]; then
	range=$1
else
	# Without origin/main (a fresh clone that has not fetched it) there is
	# no base to compare with, so check at least the tip commit and warn.
	if git -C "$repo" rev-parse --verify -q origin/main >/dev/null 2>&1; then
		range=origin/main..HEAD
	elif git -C "$repo" rev-parse --verify -q "HEAD^" >/dev/null 2>&1; then
		range="HEAD^!"
		forge_err "warning: origin/main not found; checking the tip commit only"
	else
		# A root commit has no parent for HEAD^! to exclude.
		range=HEAD
		forge_err "warning: origin/main not found; checking the tip commit only"
	fi
fi
shas=$(git -C "$repo" rev-list --reverse "$range") || exit 1
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

count=0
failed=0
for sha in $shas; do
	count=$((count + 1))
	git -C "$repo" log -1 --format=%B "$sha" >"$tmp"
	if ! forge_check_message "$tmp" 2>"$tmp.err"; then
		failed=$((failed + 1))
		printf 'FAIL  %s %s\n' "$sha" "$(head -n 1 "$tmp")"
		sed 's/^/        /' "$tmp.err"
	fi
	rm -f "$tmp.err"
done

echo "commits: $count checked in $range, $failed failed"
[ "$failed" -eq 0 ]
