use std::str::FromStr;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("migration failed: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

pub async fn connect(path: &str) -> Result<SqlitePool, DbError> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite://{path}"))?
        .create_if_missing(true)
        .foreign_keys(true);
    // Every connection to `:memory:` opens its own empty database, so an
    // in-memory pool must share one connection.
    let max = if path == ":memory:" { 1 } else { 8 };
    let pool = SqlitePoolOptions::new()
        .max_connections(max)
        .connect_with(options)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectRow {
    pub id: String,
    pub path: String,
    pub name: String,
    /// Milliseconds since the Unix epoch.
    pub last_opened_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRow {
    pub id: String,
    pub project_id: String,
    pub title: String,
    /// Milliseconds since the Unix epoch.
    pub created_at: i64,
    pub updated_at: i64,
    /// The model the session was started with, if one was recorded.
    pub model: Option<SessionModelRow>,
    pub approval_mode: Option<String>,
}

/// A session's provider, model and reasoning effort, as stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionModelRow {
    pub provider: String,
    pub model: String,
    pub effort: String,
}

type ProjectTuple = (String, String, String, i64);

fn project(row: ProjectTuple) -> ProjectRow {
    let (id, path, name, last_opened_at) = row;
    ProjectRow {
        id,
        path,
        name,
        last_opened_at,
    }
}

type SessionTuple = (
    String,
    String,
    String,
    i64,
    i64,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
);

const SESSION_COLUMNS: &str =
    "id, project_id, title, created_at, updated_at, provider, model, effort, approval_mode";

fn session(row: SessionTuple) -> SessionRow {
    let (id, project_id, title, created_at, updated_at, provider, model, effort, approval_mode) =
        row;
    let model = match (provider, model, effort) {
        (Some(provider), Some(model), Some(effort)) => Some(SessionModelRow {
            provider,
            model,
            effort,
        }),
        _ => None,
    };
    SessionRow {
        id,
        project_id,
        title,
        created_at,
        updated_at,
        model,
        approval_mode,
    }
}

/// Sets a session's approval mode; false when the session does not exist.
pub async fn set_approval_mode(pool: &SqlitePool, id: &str, mode: &str) -> Result<bool, DbError> {
    let done = sqlx::query("UPDATE sessions SET approval_mode = ?2 WHERE id = ?1")
        .bind(id)
        .bind(mode)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() == 1)
}

/// Records that the folder at `path` was opened at `now`, creating the
/// project the first time.
pub async fn upsert_project(
    pool: &SqlitePool,
    path: &str,
    name: &str,
    now: i64,
) -> Result<ProjectRow, DbError> {
    let row: ProjectTuple = sqlx::query_as(
        "INSERT INTO projects (id, path, name, last_opened_at)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_opened_at = excluded.last_opened_at
         RETURNING id, path, name, last_opened_at",
    )
    .bind(path)
    .bind(name)
    .bind(now)
    .fetch_one(pool)
    .await?;
    Ok(project(row))
}

pub async fn recent_projects(pool: &SqlitePool, limit: i64) -> Result<Vec<ProjectRow>, DbError> {
    let rows: Vec<ProjectTuple> = sqlx::query_as(
        "SELECT id, path, name, last_opened_at FROM projects
         ORDER BY last_opened_at DESC LIMIT ?1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(project).collect())
}

pub async fn get_project(pool: &SqlitePool, id: &str) -> Result<Option<ProjectRow>, DbError> {
    let row: Option<ProjectTuple> =
        sqlx::query_as("SELECT id, path, name, last_opened_at FROM projects WHERE id = ?1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(project))
}

pub async fn create_session(
    pool: &SqlitePool,
    project_id: &str,
    title: &str,
    now: i64,
) -> Result<SessionRow, DbError> {
    create_session_with(pool, project_id, title, now, None).await
}

/// Creates a session that records the model it was started with.
pub async fn create_session_with(
    pool: &SqlitePool,
    project_id: &str,
    title: &str,
    now: i64,
    model: Option<&SessionModelRow>,
) -> Result<SessionRow, DbError> {
    let row: SessionTuple = sqlx::query_as(&format!(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at, provider, model, effort)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?3, ?4, ?5, ?6)
         RETURNING {SESSION_COLUMNS}"
    ))
    .bind(project_id)
    .bind(title)
    .bind(now)
    .bind(model.map(|m| m.provider.as_str()))
    .bind(model.map(|m| m.model.as_str()))
    .bind(model.map(|m| m.effort.as_str()))
    .fetch_one(pool)
    .await?;
    Ok(session(row))
}

pub async fn get_session(pool: &SqlitePool, id: &str) -> Result<Option<SessionRow>, DbError> {
    let row: Option<SessionTuple> = sqlx::query_as(&format!(
        "SELECT {SESSION_COLUMNS} FROM sessions WHERE id = ?1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(session))
}

/// The sessions of a project, most recently active first.
pub async fn list_sessions(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<Vec<SessionRow>, DbError> {
    let rows: Vec<SessionTuple> = sqlx::query_as(&format!(
        "SELECT {SESSION_COLUMNS} FROM sessions
         WHERE project_id = ?1 ORDER BY updated_at DESC, created_at DESC"
    ))
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(session).collect())
}

/// Records activity in a session at `now`, renaming it when `title` is
/// given.
pub async fn touch_session(
    pool: &SqlitePool,
    id: &str,
    title: Option<&str>,
    now: i64,
) -> Result<(), DbError> {
    sqlx::query("UPDATE sessions SET updated_at = ?2, title = coalesce(?3, title) WHERE id = ?1")
        .bind(id)
        .bind(now)
        .bind(title)
        .execute(pool)
        .await?;
    Ok(())
}

/// The setting `name`, `None` when unset.
pub async fn get_setting(pool: &SqlitePool, name: &str) -> Result<Option<String>, DbError> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE name = ?1")
        .bind(name)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(value,)| value))
}

pub async fn set_setting(pool: &SqlitePool, name: &str, value: &str) -> Result<(), DbError> {
    sqlx::query(
        "INSERT INTO settings (name, value) VALUES (?1, ?2)
         ON CONFLICT(name) DO UPDATE SET value = ?2",
    )
    .bind(name)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}
