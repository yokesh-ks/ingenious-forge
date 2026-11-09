# ChangedFiles

Every file the session changed, each opening to its diff.

**Consumer provides:** `files` of `{path, added, removed, hunks?}`, `defaultView`, `onRevert`, `onRevertAll`.

- Changes are not findings, so `added` and `removed` are never `proof` or `halt`.
