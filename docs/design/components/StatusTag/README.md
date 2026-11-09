# StatusTag

The word and glyph for an item's state, from the system's fixed vocabulary.

**Consumer provides:** `state`, one of `queued`, `running`, `proved`, `held`, `failed`, `refused`, `halted` or `unproved`. `children` may replace the word, but keep the meaning.

- Do not add states. A new state needs a new verb in the README first.
- Show `proved` only when a check ran. Otherwise show `unproved`.
