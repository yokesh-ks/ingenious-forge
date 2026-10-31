#!/bin/bash
set -euo pipefail

# Reply to a PR review thread and optionally resolve it.
#
# Usage: bash reply-thread.sh <thread_id> <body> [--resolve]
#
# thread_id:  the GraphQL node ID of the review thread
# body:       the reply text
# --resolve:  also resolve the thread after replying

die() { echo "error: $*" >&2; exit 1; }

[ $# -ge 2 ] || die "usage: reply-thread.sh <thread_id> <body> [--resolve]"

THREAD_ID="$1"
BODY="$2"
RESOLVE="${3:-}"

gh auth status > /dev/null 2>&1 \
  || die "gh is not authenticated.  Run: gh auth login"

# --- reply ------------------------------------------------------------------

REPLY_MUTATION='mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment {
      id
      url
    }
  }
}'

result="$(gh api graphql \
  -f query="$REPLY_MUTATION" \
  -f threadId="$THREAD_ID" \
  -f body="$BODY" 2>&1)" \
  || die "reply failed: $result"

errors="$(echo "$result" | jq -r '.errors // empty')"
if [ -n "$errors" ] && [ "$errors" != "null" ]; then
  die "GraphQL errors on reply: $errors"
fi

comment_url="$(echo "$result" | jq -r '.data.addPullRequestReviewThreadReply.comment.url')"
if [ -z "$comment_url" ] || [ "$comment_url" = "null" ]; then
  die "reply succeeded but no comment URL returned"
fi
echo "Replied: $comment_url"

# --- resolve (optional) -----------------------------------------------------

if [ "$RESOLVE" = "--resolve" ]; then
  RESOLVE_MUTATION='mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread {
        id
        isResolved
      }
    }
  }'

  result="$(gh api graphql \
    -f query="$RESOLVE_MUTATION" \
    -f threadId="$THREAD_ID" 2>&1)" \
    || die "resolve failed: $result"

  errors="$(echo "$result" | jq -r '.errors // empty')"
  if [ -n "$errors" ] && [ "$errors" != "null" ]; then
    die "GraphQL errors on resolve: $errors"
  fi

  echo "Resolved: $THREAD_ID"
fi
