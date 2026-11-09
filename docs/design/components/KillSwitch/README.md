# KillSwitch

The hard stop for a trade. One press, no confirmation.

**Consumer provides:** `scope`, `onHalt`, `onResume`, and optionally `halted` or `defaultHalted`, and `detail`.

- Keep it visible on every Trading screen.
- It has no disabled state. If the daemon is down, the executor must already have stopped.
- Halting is instant, while resuming needs step-up.
