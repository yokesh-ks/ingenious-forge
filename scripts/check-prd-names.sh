#!/bin/sh
# Check that docs/PRD.md names no competing product (AGENTS.md Principle
# VII). The names are in .github/prd-banned-names.txt. POSIX sh. CI job:
# prd-names.
#
# Usage: scripts/check-prd-names.sh [<file> ...]   (default: docs/PRD.md)

root=$(cd "$(dirname "$0")/.." && pwd)
names=$root/.github/prd-banned-names.txt
[ $# -eq 0 ] && set -- "$root/docs/PRD.md"

patterns=$(grep -v -e '^#' -e '^[[:space:]]*$' "$names")
rc=0
for f in "$@"; do
	# Case-insensitive, fixed-string, whole-word matches.
	hits=$(printf '%s\n' "$patterns" | grep -niwF -f - "$f")
	if [ -n "$hits" ]; then
		printf 'FAIL  %s names a competing product:\n' "$f"
		printf '%s\n' "$hits" | sed 's/^/        /'
		rc=1
	fi
done

[ $rc -eq 0 ] && echo "prd-names: ok"
exit $rc
