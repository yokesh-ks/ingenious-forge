-- The provider, model and reasoning effort a session was started with.
-- Sessions created before this migration have none and use the default.
ALTER TABLE sessions ADD COLUMN provider TEXT;
ALTER TABLE sessions ADD COLUMN model TEXT;
ALTER TABLE sessions ADD COLUMN effort TEXT;
