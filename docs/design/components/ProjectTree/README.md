# ProjectTree

The Work sidebar: recent projects, each expanding to its sessions with their status.

**Consumer provides:** `projects` of `{id, name, sessions: [{id, title, status?, pinned?, time?}]}`, `session` or `defaultSession`, `onSelect`, `onNew`, `onOpenFolder`. `status` is `running`, `held` or `failed`, and any other session shows no glyph.

- Sort pinned sessions to the top before passing them in.
- Held sessions must be visible with the project collapsed in the rail's `held` count.
