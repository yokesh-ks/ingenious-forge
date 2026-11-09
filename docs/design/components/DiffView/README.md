# DiffView

A file's changes, unified or side by side.

**Consumer provides:** `hunks` of `{header, lines: [{t, o?, n?, s}]}`, where `t` is `+`, `-` or a space, and `view` (`unified` or `split`).

- Added and removed lines always carry their sign as well as their colour.
