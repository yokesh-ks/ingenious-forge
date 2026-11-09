# AuditTrail

A hash-chained, newest-first list of who did what.

**Consumer provides:** `items` of `{time, actor, verb, object, state?, hash}`, an optional `title`, and `intact`, the daemon's own chain check. Set `intact={false}` to show a broken chain.

- Use only the README's verbs.
- Never hide or collapse a broken-chain state.
- Rows narrow to a stacked layout on small panels.
