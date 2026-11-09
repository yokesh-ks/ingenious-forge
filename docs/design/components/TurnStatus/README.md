# TurnStatus

The status row at the head of each turn, folding its work beneath it.

**Consumer provides:** `state` (`running`, `completed`, `failed` or `stopped`), `elapsed`, `error`, and the turn's work as `children`. Completed turns start folded, while failed and stopped turns start open.

- `completed` stays neutral. Finishing is not proof, and only a `Hallmark` says a result was checked.
