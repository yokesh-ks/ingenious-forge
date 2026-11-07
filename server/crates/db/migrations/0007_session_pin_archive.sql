-- When a session was pinned or archived; NULL when it is not.
ALTER TABLE sessions ADD COLUMN pinned_at INTEGER;
ALTER TABLE sessions ADD COLUMN archived_at INTEGER;
