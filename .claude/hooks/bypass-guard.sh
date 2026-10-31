#!/usr/bin/env bash
# PreToolUse hook: block --no-verify, -n (git commit) and
# -c core.hooksPath= to prevent skipping the project's git hooks.
# Fails open (exit 0, no decision) when it cannot parse the command.

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "bypass-guard: jq not found; skipping (fail open)" >&2
  exit 0
fi

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || {
  echo "bypass-guard: failed to parse stdin JSON; skipping (fail open)" >&2
  exit 0
}

[ -z "$COMMAND" ] && exit 0

reason=""

case "$COMMAND" in
  *--no-verify*)
    reason="--no-verify skips the project's git hooks. Remove it; the hooks enforce commit conventions and attribution rules (AGENTS.md Principle VII)."
    ;;
  *-c\ core.hooksPath=* | *-c\ core.hooksPath\ *)
    reason="Overriding core.hooksPath disables the project's git hooks. Remove the -c flag (see docs/process/agent-permissions.md)."
    ;;
esac

if [ -z "$reason" ]; then
  case "$COMMAND" in
    git\ commit*)
      # Detect -n standalone or combined (e.g. -nm, -an) using grep.
      if printf '%s' "$COMMAND" | grep -qE ' -[a-zA-Z]*n[a-zA-Z]*([ "'\''\\]|$)'; then
        reason="-n is shorthand for --no-verify and skips the project's git hooks. Remove it."
      fi
      ;;
  esac
fi

if [ -n "$reason" ]; then
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
fi

exit 0
