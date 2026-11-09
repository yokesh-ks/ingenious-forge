# EvidenceBlock

The raw record that proves a claim: what ran, how it exited and what it printed.

**Consumer provides:** `command`, `exit`, `output`, and an optional `footer` with who ran it and when.

- Show actual output, not a summary of it.
- `exit` is required. A non-zero exit turns `halt`.
