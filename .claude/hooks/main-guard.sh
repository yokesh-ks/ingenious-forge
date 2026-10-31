#!/usr/bin/env bash
# PreToolUse hook: block git commit and git push on main/master.
# Fails open (exit 0, no decision) when it cannot determine the branch.

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "main-guard: jq not found; skipping (fail open)" >&2
  exit 0
fi

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || {
  echo "main-guard: failed to parse stdin JSON; skipping (fail open)" >&2
  exit 0
}

[ -z "$COMMAND" ] && exit 0

case "$COMMAND" in
  git\ commit* | git\ push*) ;;
  *) exit 0 ;;
esac

BRANCH=$(git symbolic-ref --short -q HEAD 2>/dev/null) || exit 0

case "$BRANCH" in
  main | master)
    [ "${FORGE_ALLOW_MAIN:-}" = "1" ] && exit 0
    reason="Working on '${BRANCH}' is blocked. Use workspace-setup to create a branch (see .agents/skills/workspace-setup/). Maintainer override: FORGE_ALLOW_MAIN=1."
    jq -n --arg reason "$reason" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
    ;;
esac

exit 0
