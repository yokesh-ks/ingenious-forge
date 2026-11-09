# ToolApproval

An inline request to run an exact command or apply an exact edit.

**Consumer provides:** `kind` (`command` or `edit`), `command` or `path` and `diff`, an optional `reason`, and `onAnswer`, which receives `approve`, `deny` or `always_allow`.

- Show the exact command, never a paraphrase.
- Once answered, it collapses to one line recording who decided.
- Forge says Deny on the button and shows Denied after. Both map to the `refused` state.
- Use `ApprovalGate`, with step-up, for anything that moves money.
