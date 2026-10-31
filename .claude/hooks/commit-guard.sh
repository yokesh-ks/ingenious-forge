#!/usr/bin/env bash
# PreToolUse hook: block git commit / gh pr create / gh pr edit whose
# message or body contains AI attribution.  Reuses .githooks/lib/checks.sh.
# Fails open (exit 0, no decision) when it cannot parse the command.

set -uo pipefail

HOOKS_DIR="${CLAUDE_PROJECT_DIR:-.}/.githooks"
CHECKS_LIB="$HOOKS_DIR/lib/checks.sh"

if [ ! -r "$CHECKS_LIB" ]; then
  echo "commit-guard: cannot read $CHECKS_LIB; skipping (fail open)" >&2
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "commit-guard: jq not found; skipping (fail open)" >&2
  exit 0
fi

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || {
  echo "commit-guard: failed to parse stdin JSON; skipping (fail open)" >&2
  exit 0
}

[ -z "$COMMAND" ] && exit 0

# Source the shared checks library (POSIX sh compatible).
FORGE_HOOKS_DIR="$HOOKS_DIR"
# shellcheck source=../../.githooks/lib/checks.sh
. "$CHECKS_LIB"

# Run attribution pattern matching against the full command text.
# The commit message or PR body is embedded in the command string, so
# matching patterns there catches all quoting styles and heredocs.
hits=$(forge_attribution_hits "$COMMAND") || {
  echo "commit-guard: forge_attribution_hits failed; skipping (fail open)" >&2
  exit 0
}

if [ -n "$hits" ]; then
  reason="AI attribution blocked (AGENTS.md Principle VII). Remove these lines:"
  while IFS= read -r line; do
    [ -n "$line" ] && reason="${reason}
  > ${line}"
  done <<< "$hits"

  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
fi

exit 0
