#!/bin/sh
# Run every repo-hygiene CI check locally, the same way CI runs them
# (.github/workflows/repo-hygiene.yml). POSIX sh. Exits non-zero if any
# check fails.
#
# Usage: scripts/check-all.sh [<range>]   (commit range, default origin/main..HEAD)
#
# The pr-body check needs a pull request's title and body, so it is
# skipped here; run scripts/check-pr-body.sh for it.

root=$(cd "$(dirname "$0")/.." && pwd)
failed=

run() {
	_name=$1
	shift
	echo "== $_name"
	"$@" || failed="$failed $_name"
	echo
}

run commits sh "$root/scripts/check-commits.sh" "${1:-origin/main..HEAD}"
echo "== pr-body"
echo "skipped: needs a pull request; run scripts/check-pr-body.sh"
echo
run skills sh "$root/scripts/check-skills.sh"
run sop sh "$root/scripts/check-sop.sh"
run notice sh "$root/scripts/check-notice.sh"
run links node "$root/scripts/check-links.mjs"
run prd-names sh "$root/scripts/check-prd-names.sh"

if [ -n "$failed" ]; then
	echo "check-all: failed:$failed"
	exit 1
fi
echo "check-all: all checks passed (pr-body skipped)"
