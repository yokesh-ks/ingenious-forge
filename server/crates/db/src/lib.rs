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

type SessionTuple = (String, String, String, i64, i64);

fn session(row: SessionTuple) -> SessionRow {
    let (id, project_id, title, created_at, updated_at) = row;
    SessionRow {
        id,
        project_id,
        title,
        created_at,
        updated_at,
    }
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
    let row: SessionTuple = sqlx::query_as(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?3)
         RETURNING id, project_id, title, created_at, updated_at",
    )
    .bind(project_id)
    .bind(title)
    .bind(now)
    .fetch_one(pool)
    .await?;
    Ok(session(row))
}

pub async fn get_session(pool: &SqlitePool, id: &str) -> Result<Option<SessionRow>, DbError> {
    let row: Option<SessionTuple> = sqlx::query_as(
        "SELECT id, project_id, title, created_at, updated_at FROM sessions WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(session))
}
