#!/bin/sh
# Validate SOP structure with agent-sop's validate-sop.sh. POSIX sh.
# CI job: sop.
#
# Checks every tracked *.sop.md file and the SOPs bundled in
# .agents/skills/agent-sop/references/*.md. The validator rejects any
# file not named *.sop.md, but the references use the same structure, so
# each one is validated as a temporary *.sop.md copy.
#
# Usage: scripts/check-sop.sh

root=$(cd "$(dirname "$0")/.." && pwd)
validator=$root/.agents/skills/agent-sop/scripts/validate-sop.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

count=0
failed=0
files=$(cd "$root" && git ls-files '*.sop.md' '.agents/skills/agent-sop/references/*.md')
for f in $files; do
	count=$((count + 1))
	case $f in
	*.sop.md) target=$root/$f ;;
	*)
		target=$tmp/$(basename "$f" .md).sop.md
		cp "$root/$f" "$target"
		;;
	esac
	if bash "$validator" "$target" >"$tmp/out" 2>&1; then
		printf 'ok    %s\n' "$f"
	else
		failed=$((failed + 1))
		printf 'FAIL  %s\n' "$f"
		grep '❌' "$tmp/out" | sed 's/^/        /'
	fi
done

echo "sop: $count checked, $failed failed"
[ "$failed" -eq 0 ]
