//! Projects the user opens and the sessions inside them (PRD §6.2
//! Projects and session list).

use std::path::PathBuf;

use api_types::{Project, Session};
use db::{DbError, ProjectRow, SessionRow};
use sqlx::SqlitePool;

use crate::folders::{inspect_folder, FolderError};

const RECENT_LIMIT: i64 = 20;
const NEW_SESSION_TITLE: &str = "New session";

#[derive(Debug, thiserror::Error)]
pub enum ProjectError {
    #[error(transparent)]
    Folder(#[from] FolderError),
    #[error("project not found")]
    NotFound,
    #[error(transparent)]
    Db(#[from] DbError),
}

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

fn project(row: ProjectRow) -> Project {
    Project {
        id: row.id,
        name: row.name,
        path: row.path,
        last_opened_at: row.last_opened_at,
    }
}

fn session(row: SessionRow) -> Session {
    Session {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

/// Opens the git repository at `path` as a project, recording it as the
/// most recently opened one.
pub async fn open_project(pool: &SqlitePool, path: &str) -> Result<Project, ProjectError> {
    let folder = inspect_folder(path)?;
    let row =
        db::upsert_project(pool, &folder.path.to_string_lossy(), &folder.name, now_ms()).await?;
    Ok(project(row))
}

pub async fn recent_projects(pool: &SqlitePool) -> Result<Vec<Project>, ProjectError> {
    let rows = db::recent_projects(pool, RECENT_LIMIT).await?;
    Ok(rows.into_iter().map(project).collect())
}

pub async fn get_project(pool: &SqlitePool, id: &str) -> Result<Project, ProjectError> {
    db::get_project(pool, id)
        .await?
        .map(project)
        .ok_or(ProjectError::NotFound)
}

/// Creates a session in a project; returns it with the folder its agent
/// works in.
pub async fn create_session(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<(Session, PathBuf), ProjectError> {
    let project = get_project(pool, project_id).await?;
    let row = db::create_session(pool, &project.id, NEW_SESSION_TITLE, now_ms()).await?;
    Ok((session(row), PathBuf::from(project.path)))
}

/// The project folder of `session_id`, or `None` for an unknown session.
pub async fn session_folder(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Option<PathBuf>, ProjectError> {
    let Some(session) = db::get_session(pool, session_id).await? else {
        return Ok(None);
    };
    let project = get_project(pool, &session.project_id).await?;
    Ok(Some(PathBuf::from(project.path)))
}
