# LedgerTable

Records with right-aligned numerals and a double-ruled total.

**Consumer provides:** `columns` of `{key, label, numeric?, mono?}`, `rows`, and optional `caption` and `total`. A column keyed `state` renders a `StatusTag`. A row with `state: 'failed'` is tinted `halt-wash`.

- Do not stripe rows. Tint means a break.
- Pre-format numbers to one precision per column.
