#!/usr/bin/env bash
# Stop hook: advisory reminder to run verification before claiming done.
# NEVER blocks (never exits 2). Outputs additionalContext when files
# changed but no verification command was detected in the transcript.

# Fail open on any error — advisory only.
trap 'exit 0' ERR

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null) || exit 0

# Check for uncommitted changes to tracked files (staged or unstaged).
if git diff --quiet HEAD 2>/dev/null && git diff --cached --quiet HEAD 2>/dev/null; then
  exit 0
fi

# Grep the transcript for known verification commands.
VERIFY_PATTERN='scripts/check-all\.sh\|verify-before-done\|validate-sop\.sh\|test-hooks\.sh\|check-commits\.sh\|check-skills\.sh\|check-sop\.sh\|check-notice\.sh\|check-links\.mjs\|check-pr-body\.sh\|check-prd-names\.sh'

if [ -n "$TRANSCRIPT" ] && [ -r "$TRANSCRIPT" ]; then
  if grep -q "$VERIFY_PATTERN" "$TRANSCRIPT" 2>/dev/null; then
    exit 0
  fi
fi

jq -n '{
  hookSpecificOutput: {
    additionalContext: "Files were modified but no verification command ran. Run scripts/check-all.sh or invoke verify-before-done before claiming completion."
  }
}'

exit 0
