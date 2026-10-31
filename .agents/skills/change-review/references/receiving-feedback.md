# Receiving feedback

A quick-reference card for Receive mode. The full workflow is in `SKILL.md`.

## The pattern

```
READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT
```

Do every step in order. Do not start implementing while still reading.

## Step rules

| Step | Rule |
| --- | --- |
| READ | Read all items before touching code. |
| UNDERSTAND | Restate each item as a technical requirement. If any item is unclear, ask about **all** unclear items before implementing any of them. |
| VERIFY | Check the claimed problem in the actual file at the actual line. If you cannot reproduce it, say so. |
| EVALUATE | Is it correct? YAGNI? PRD/ADR/Principle conflict? Does the reviewer have full context? |
| RESPOND | Technical statement or reasoned pushback. No performative agreement. |
| IMPLEMENT | One item at a time. Run `verify-before-done` after each fix. |

## Forbidden phrases

Never write these:

- "You're absolutely right!"
- "Great point!"
- "Excellent suggestion!"
- "That's a really good catch."
- Any equivalent that signals agreement before verification.

## YAGNI check

Before accepting a suggestion to add, preserve or enhance a feature:

```bash
grep -rn "<feature name>" .
```

If nothing calls it, question whether it should exist at all.

## Pushback format

State the specific evidence that contradicts the finding:

```
I checked <file>:<line>. The code <does X> because <reason>. This is
consistent with <PRD section / ADR / Principle N>. No change needed here.
```

If architectural, involve the maintainer rather than overriding
unilaterally.

## GitHub replies

Reply inside the inline thread, not as a new top-level PR comment:

```bash
gh api repos/{owner}/{repo}/pulls/{n}/comments/{comment_id}/replies \
  -f body="Fixed in <SHA>: <one sentence>"
```

## Handling sources

| Source | Skepticism level |
| --- | --- |
| Maintainer | Low — implement once understood, ask if scope unclear. |
| External reviewer | High — verify correctness, check for context gaps, check for breakage. |
| Automated tool | Medium — fix the reported item, understand it before dismissing. |

## Provenance

Reference card for the receive side of `change-review`. Content derived
from `skills/receiving-code-review/SKILL.md` in
https://github.com/obra/superpowers, commit
`2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`, MIT License, Copyright (c)
2025 Jesse Vincent. See `../LICENSE`.
