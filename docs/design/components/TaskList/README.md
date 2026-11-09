# TaskList

The agent's working checklist for a multi-step task.

**Consumer provides:** `items` of `{label, status?}`, where `status` is `pending`, `in_progress` or `done`, and an optional `title`.

- A done task is the agent's own claim, so its tick stays neutral.
