#!/bin/sh
# Check every commit in a range with the shared hook checks: conventional
# title and no AI attribution. POSIX sh. CI job: commits.
#
# Usage: scripts/check-commits.sh [<range>]   (default: origin/main..HEAD)

root=$(cd "$(dirname "$0")/.." && pwd)
FORGE_HOOKS_DIR=$root/.githooks
# shellcheck source-path=SCRIPTDIR source=../.githooks/lib/checks.sh
. "$FORGE_HOOKS_DIR/lib/checks.sh"

if [ $# -ge 1 ]; then
	range=$1
else
	# Derive the default range. If origin/main hasn't been fetched yet,
	# fall back to the merge-base so the script still works in a fresh clone.
	if git -C "$root" rev-parse --verify origin/main >/dev/null 2>&1; then
		range=origin/main..HEAD
	else
		base=$(git -C "$root" merge-base HEAD "$(git -C "$root" rev-parse HEAD)" 2>/dev/null) || base=
		if [ -n "$base" ]; then
			range="$base..HEAD"
		else
			range="HEAD^!"
		fi
		forge_err "warning: origin/main not found; checking $range only"
	fi
fi
shas=$(git -C "$root" rev-list --reverse "$range") || exit 1
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

count=0
failed=0
for sha in $shas; do
	count=$((count + 1))
	git -C "$root" log -1 --format=%B "$sha" >"$tmp"
	if ! forge_check_message "$tmp" 2>"$tmp.err"; then
		failed=$((failed + 1))
		printf 'FAIL  %s %s\n' "$sha" "$(head -n 1 "$tmp")"
		sed 's/^/        /' "$tmp.err"
	fi
	rm -f "$tmp.err"
done

echo "commits: $count checked in $range, $failed failed"
[ "$failed" -eq 0 ]
