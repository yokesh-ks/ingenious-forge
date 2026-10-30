#!/bin/sh
# Check that every docs/reference/<project>/ keeps the project's LICENSE
# and is listed in docs/reference/README.md. POSIX sh. CI job: notice.
#
# Usage: scripts/check-notice.sh

root=$(cd "$(dirname "$0")/.." && pwd)
ref=$root/docs/reference
readme=$ref/README.md

count=0
failed=0
for dir in "$ref"/*/; do
	[ -d "$dir" ] || continue
	name=$(basename "$dir")
	count=$((count + 1))
	ok=1
	if [ ! -f "$dir/LICENSE" ]; then
		printf 'FAIL  docs/reference/%s/ has no LICENSE\n' "$name"
		ok=0
	fi
	if ! grep -Fq "| \`$name/\` |" "$readme"; then
		printf 'FAIL  docs/reference/%s/ is not listed in docs/reference/README.md\n' "$name"
		ok=0
	fi
	[ $ok -eq 1 ] || failed=$((failed + 1))
done

echo "notice: $count reference folders checked, $failed failed"
[ "$failed" -eq 0 ]
