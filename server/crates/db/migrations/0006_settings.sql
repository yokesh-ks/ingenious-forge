-- Settings that are not secret, such as new-session defaults, as JSON by
-- name.
CREATE TABLE settings (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
