# ProcessGroup

A folding group of what the agent did between replies, one row per tool call.

**Consumer provides:** `title`, `items` of `{tool, detail, body?}`, `defaultOpen`, `onInspect`. `body` is what a row opens to, usually `EvidenceBlock` or `FileExcerpt`.

- Title the group by its kinds of work, most frequent first: "Ran commands and read files".
- Every row has Inspect, shown on hover and focus.
