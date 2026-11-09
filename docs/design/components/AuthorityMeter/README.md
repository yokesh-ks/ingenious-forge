# AuthorityMeter

How much of an agent's delegated authority is spent.

**Consumer provides:** `label`, `used`, `limit`, and optionally `warnAt` (percent, default 80) and `format`.

- The values come from the daemon's policy, never from the agent's own report.
