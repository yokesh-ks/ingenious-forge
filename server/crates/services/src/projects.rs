//! Projects the user opens and the sessions inside them (PRD §6.2
//! Projects and session list).

use std::path::PathBuf;

use api_types::{ApprovalMode, Project, Session, SessionModel};
use db::{DbError, ProjectRow, SessionModelRow, SessionRow};
use sqlx::SqlitePool;

use crate::folders::{inspect_folder, FolderError};

const RECENT_LIMIT: i64 = 20;
const NEW_SESSION_TITLE: &str = "New session";
const MAX_TITLE_CHARS: usize = 60;

#[derive(Debug, thiserror::Error)]
pub enum ProjectError {
    #[error(transparent)]
    Folder(#[from] FolderError),
    #[error("project not found")]
    NotFound,
    #[error("the project name cannot be empty")]
    BlankName,
    #[error("the session title cannot be empty")]
    BlankTitle,
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
        // Only the agent knows; the API layer fills it in.
        running: false,
        model: row.model.and_then(session_model),
        approval_mode: row
            .approval_mode
            .and_then(|m| m.parse().ok())
            .unwrap_or_default(),
        pinned: row.pinned,
        archived: row.archived,
    }
}

/// A stored model choice; `None` when its effort is not one Forge knows.
fn session_model(row: SessionModelRow) -> Option<SessionModel> {
    Some(SessionModel {
        effort: row.effort.parse().ok()?,
        provider: row.provider,
        model: row.model,
    })
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

/// Changes the name Forge shows for a project; its folder stays as it is.
pub async fn rename_project(
    pool: &SqlitePool,
    id: &str,
    name: &str,
) -> Result<Project, ProjectError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(ProjectError::BlankName);
    }
    if !db::rename_project(pool, id, name).await? {
        return Err(ProjectError::NotFound);
    }
    get_project(pool, id).await
}

/// Forgets a project and its sessions. Its folder on disk is not touched.
pub async fn delete_project(pool: &SqlitePool, id: &str) -> Result<(), ProjectError> {
    if !db::delete_project(pool, id).await? {
        return Err(ProjectError::NotFound);
    }
    Ok(())
}

/// Creates a session in a project, recording the model it starts with;
/// returns it with the folder its agent works in.
pub async fn create_session(
    pool: &SqlitePool,
    project_id: &str,
    model: Option<&SessionModel>,
) -> Result<(Session, PathBuf), ProjectError> {
    let project = get_project(pool, project_id).await?;
    let stored = model.map(|m| SessionModelRow {
        provider: m.provider.clone(),
        model: m.model.clone(),
        effort: m.effort.as_str().to_string(),
    });
    let row = db::create_session_with(
        pool,
        &project.id,
        NEW_SESSION_TITLE,
        now_ms(),
        stored.as_ref(),
    )
    .await?;
    Ok((session(row), PathBuf::from(project.path)))
}

/// A session by id.
pub async fn get_session(pool: &SqlitePool, session_id: &str) -> Result<Session, ProjectError> {
    db::get_session(pool, session_id)
        .await?
        .map(session)
        .ok_or(ProjectError::NotFound)
}

/// Sets a session's approval mode and returns the updated session.
pub async fn set_approval_mode(
    pool: &SqlitePool,
    session_id: &str,
    mode: ApprovalMode,
) -> Result<Session, ProjectError> {
    if !db::set_approval_mode(pool, session_id, mode.as_str()).await? {
        return Err(ProjectError::NotFound);
    }
    get_session(pool, session_id).await
}

/// The project folder and model choice of `session_id`, or `None` for an
/// unknown session.
pub async fn session_settings(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Option<(PathBuf, Option<SessionModel>)>, ProjectError> {
    let Some(row) = db::get_session(pool, session_id).await? else {
        return Ok(None);
    };
    let project = get_project(pool, &row.project_id).await?;
    Ok(Some((
        PathBuf::from(project.path),
        row.model.and_then(session_model),
    )))
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

/// The sessions of a project, most recently active first.
pub async fn list_sessions(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<Vec<Session>, ProjectError> {
    get_project(pool, project_id).await?;
    let rows = db::list_sessions(pool, project_id).await?;
    Ok(rows.into_iter().map(session).collect())
}

/// Renames, pins or archives a session and returns the updated session.
pub async fn update_session(
    pool: &SqlitePool,
    id: &str,
    title: Option<&str>,
    pinned: Option<bool>,
    archived: Option<bool>,
) -> Result<Session, ProjectError> {
    let title = title.map(str::trim);
    if title.is_some_and(str::is_empty) {
        return Err(ProjectError::BlankTitle);
    }
    let update = db::SessionUpdate {
        title,
        pinned,
        archived,
    };
    if !db::update_session(pool, id, update, now_ms()).await? {
        return Err(ProjectError::NotFound);
    }
    get_session(pool, id).await
}

/// Creates the record of a fork of `session_id`: same project, model and
/// approval mode. The caller copies the session's log.
pub async fn create_fork(pool: &SqlitePool, session_id: &str) -> Result<Session, ProjectError> {
    let source = db::get_session(pool, session_id)
        .await?
        .ok_or(ProjectError::NotFound)?;
    let title = format!("{} (fork)", source.title);
    let row = db::create_session_with(
        pool,
        &source.project_id,
        &title,
        now_ms(),
        source.model.as_ref(),
    )
    .await?;
    if let Some(mode) = &source.approval_mode {
        db::set_approval_mode(pool, &row.id, mode).await?;
    }
    get_session(pool, &row.id).await
}

/// Deletes one session's record, as when its fork could not be completed.
pub async fn delete_session(pool: &SqlitePool, id: &str) -> Result<(), ProjectError> {
    db::delete_session(pool, id).await?;
    Ok(())
}

/// A session title from the first line of a message.
pub fn title_from_message(text: &str) -> String {
    let line = text.trim().lines().next().unwrap_or_default().trim();
    if line.chars().count() <= MAX_TITLE_CHARS {
        return line.to_string();
    }
    let cut: String = line.chars().take(MAX_TITLE_CHARS - 1).collect();
    format!("{}…", cut.trim_end())
}

/// Records that the user sent `text` in a session: the first message names
/// an untitled session, and every message updates its last activity.
pub async fn record_message(
    pool: &SqlitePool,
    session_id: &str,
    text: &str,
) -> Result<(), ProjectError> {
    let Some(row) = db::get_session(pool, session_id).await? else {
        return Ok(());
    };
    let title = (row.title == NEW_SESSION_TITLE && !text.trim().is_empty())
        .then(|| title_from_message(text));
    db::touch_session(pool, session_id, title.as_deref(), now_ms()).await?;
    Ok(())
}
