#!/bin/bash
set -euo pipefail

# Fetch all conversation comments, reviews and inline review threads for the
# current branch's open PR.  Outputs a single JSON object.
#
# Ported from openai/skills fetch_comments.py (Apache-2.0) to bash + gh api
# graphql, with pagination for every connection.
#
# Usage: bash fetch-comments.sh

# --- helpers ----------------------------------------------------------------

die() { echo "error: $*" >&2; exit 1; }

# Run a paginated GraphQL query.  $1 = query template with $CURSOR placeholder,
# $2 = jq path to the connection (e.g. ".data.node.comments"), $3 = output
# file that collects the nodes array.
paginate() {
  local query_tpl="$1" jq_path="$2" out="$3"
  local cursor="null" has_next="true" page=0
  local max_pages="${MAX_PAGES:-50}"

  echo '[]' > "$out"

  while [ "$has_next" = "true" ]; do
    local after
    if [ "$cursor" = "null" ]; then
      after="null"
    else
      after="\"$cursor\""
    fi

    local query="${query_tpl//\$CURSOR/$after}"
    local result
    result="$(gh api graphql -f query="$query" 2>&1)" \
      || die "GraphQL request failed: $result"

    local errors
    errors="$(echo "$result" | jq -r '.errors // empty')"
    if [ -n "$errors" ] && [ "$errors" != "null" ]; then
      die "GraphQL errors: $errors"
    fi

    local nodes
    nodes="$(echo "$result" | jq "$jq_path.nodes // []")"
    jq -s '.[0] + .[1]' "$out" <(echo "$nodes") > "${out}.tmp" \
      && mv "${out}.tmp" "$out"

    has_next="$(echo "$result" | jq -r "$jq_path.pageInfo.hasNextPage")"
    cursor="$(echo "$result" | jq -r "$jq_path.pageInfo.endCursor")"
    page=$((page + 1))

    if [ "$page" -gt "$max_pages" ]; then
      die "pagination safety limit reached (>${max_pages} pages) for $jq_path"
    fi
  done
}

# --- preconditions ----------------------------------------------------------

gh auth status > /dev/null 2>&1 \
  || die "gh is not authenticated.  Run: gh auth login"

pr_json="$(gh pr view --json number,url,id,headRefName,baseRefName 2>&1)" \
  || die "no open PR for this branch.  Push and open one first."

pr_number="$(echo "$pr_json" | jq -r '.number')"
pr_url="$(echo "$pr_json"    | jq -r '.url')"
pr_node_id="$(echo "$pr_json" | jq -r '.id')"
head_ref="$(echo "$pr_json"  | jq -r '.headRefName')"
base_ref="$(echo "$pr_json"  | jq -r '.baseRefName')"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# --- conversation comments --------------------------------------------------

CONVO_QUERY='query {
  node(id: "'"$pr_node_id"'") {
    ... on PullRequest {
      comments(first: 100, after: $CURSOR) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          author { login }
          body
          createdAt
          url
        }
      }
    }
  }
}'

paginate "$CONVO_QUERY" ".data.node.comments" "$tmpdir/convo.json"

# --- reviews ----------------------------------------------------------------

REVIEWS_QUERY='query {
  node(id: "'"$pr_node_id"'") {
    ... on PullRequest {
      reviews(first: 100, after: $CURSOR) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          author { login }
          state
          body
          createdAt
          url
        }
      }
    }
  }
}'

paginate "$REVIEWS_QUERY" ".data.node.reviews" "$tmpdir/reviews.json"

# --- review threads (with nested comments) ----------------------------------

THREADS_QUERY='query {
  node(id: "'"$pr_node_id"'") {
    ... on PullRequest {
      reviewThreads(first: 100, after: $CURSOR) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 100) {
            nodes {
              id
              author { login }
              body
              createdAt
              url
            }
          }
        }
      }
    }
  }
}'

paginate "$THREADS_QUERY" ".data.node.reviewThreads" "$tmpdir/threads.json"

# Paginate nested comments for threads that have more than 100 comments.
thread_count="$(jq 'length' "$tmpdir/threads.json")"
for i in $(seq 0 $((thread_count - 1))); do
  thread_id="$(jq -r ".[$i].id" "$tmpdir/threads.json")"
  comment_count="$(jq ".[$i].comments.nodes | length" "$tmpdir/threads.json")"

  if [ "$comment_count" -lt 100 ]; then
    continue
  fi

  THREAD_COMMENTS_QUERY='query {
    node(id: "'"$thread_id"'") {
      ... on PullRequestReviewThread {
        comments(first: 100, after: $CURSOR) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            author { login }
            body
            createdAt
            url
          }
        }
      }
    }
  }'

  paginate "$THREAD_COMMENTS_QUERY" ".data.node.comments" "$tmpdir/thread_comments.json"
  jq --argjson idx "$i" --slurpfile comments "$tmpdir/thread_comments.json" \
    '.[$idx].comments.nodes = $comments[0]' "$tmpdir/threads.json" > "$tmpdir/threads.tmp" \
    && mv "$tmpdir/threads.tmp" "$tmpdir/threads.json"
done

# --- assemble output --------------------------------------------------------

jq -n \
  --arg number "$pr_number" \
  --arg url "$pr_url" \
  --arg head "$head_ref" \
  --arg base "$base_ref" \
  --slurpfile convo "$tmpdir/convo.json" \
  --slurpfile reviews "$tmpdir/reviews.json" \
  --slurpfile threads "$tmpdir/threads.json" \
  '{
    pull_request: {
      number: ($number | tonumber),
      url: $url,
      headRefName: $head,
      baseRefName: $base
    },
    conversation_comments: $convo[0],
    reviews: $reviews[0],
    review_threads: $threads[0]
  }'
