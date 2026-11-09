# ApprovalGate

The stop between an agent's proposal and anything that needs a person.

**Consumer provides:** `actor`, `title`, `onApprove`, `onRefuse`, and optionally `amount`, `reason`, `policy`, `checks` (`{state, label}`), `mode` and `stepUp`.

- Set `stepUp` for all trading and money movement, whichever agent or surface asked.
- Set `mode` to `Paper` or `Live` on every Trading gate.
- Say why it was held, in one sentence, and name the policy.
- A gate that times out resolves as refused.
