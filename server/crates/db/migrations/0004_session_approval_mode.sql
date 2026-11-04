-- The approval mode of a session (ask, auto_edit or full_auto). Sessions
-- created before this migration have none and use the default.
ALTER TABLE sessions ADD COLUMN approval_mode TEXT;
