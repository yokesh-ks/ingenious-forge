# DaemonStatus

Whether this surface can reach the local daemon, the source of truth.

**Consumer provides:** `state` (`connected`, `degraded` or `offline`), and optional `address` and `surface`.

- Show it on every surface: web, desktop and extension.
- When `offline`, stop every action that needs policy.
