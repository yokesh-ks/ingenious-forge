# ReplyFooter

The row under an agent reply: copy, rating, share, token usage and its hallmark.

**Consumer provides:** `tokens` and an optional `hallmark` (`Hallmark` props).

- Omit `hallmark` on replies that changed nothing. On a reply that changed files with no check, pass `state: 'unproved'`.
