-- Projects the user opened, and sessions that belong to them. The 0001
-- sessions table never held data, so it is replaced rather than altered.
DROP TABLE IF EXISTS sessions;

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    last_opened_at INTEGER NOT NULL
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX sessions_by_project ON sessions(project_id, updated_at);
