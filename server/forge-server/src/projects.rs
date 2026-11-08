//! HTTP API for projects, their sessions and the folder picker.

use std::sync::Arc;

use agent::{model::ModelError, tools::ToolBox};
use api_types::{
    ApiError, CommitMessageDraft, CommitRequest, CommitResult, CreateBranchRequest,
    CreateSessionRequest, FileContent, FileList, GitStatus, ModelCatalog, OpenInRequest,
    OpenProjectRequest, PickedFolder, Project, PushResult, RenameProjectRequest, SandboxInfo,
    Session, SessionEnvelope, SessionEvent, SetApprovalModeRequest, SetSessionModelRequest,
    TitleSource, UpdateSessionRequest,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use serde::Deserialize;
use services::{
    folders,
    projects::{self, ProjectError},
};

use crate::state::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/projects", get(recent_projects).post(open_project))
        .route(
            "/projects/{id}",
            get(get_project)
                .patch(rename_project)
                .delete(delete_project),
        )
        .route("/projects/{id}/open-in", post(open_project_in))
        .route(
            "/sessions/{id}",
            axum::routing::patch(update_session).delete(delete_session),
        )
        .route("/sessions/{id}/fork", post(fork_session))
        .route("/projects/{id}/files", get(project_files))
        .route("/projects/{id}/file", get(project_file))
        .route("/projects/{id}/git/status", get(git_status))
        .route("/projects/{id}/git/branch", post(create_branch))
        .route("/projects/{id}/git/commit", post(commit))
        .route("/projects/{id}/git/push", post(push))
        .route("/sessions/{id}/commit-message", post(draft_commit_message))
        .route(
            "/projects/{id}/terminal",
            get(crate::terminal::terminal_socket).delete(crate::terminal::close_terminal),
        )
        .route(
            "/projects/{id}/sessions",
            get(list_sessions).post(create_session),
        )
        .route("/sessions/{id}/events", get(session_events))
        .route("/sessions/{id}/changes", get(session_changes))
        .route("/sessions/{id}/stats", get(session_stats))
        .route("/sessions/{id}/approval-mode", put(set_approval_mode))
        .route("/sessions/{id}/model", put(set_session_model))
        .route("/sessions/{id}/sandbox", get(session_sandbox))
        .route("/fs/pick-folder", post(pick_folder))
        .route("/models", get(model_catalog))
}

/// A failed request: its status and a message for the user.
pub struct ApiFailure(StatusCode, String);

impl ApiFailure {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self(status, message.into())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, message.into())
    }
}

impl IntoResponse for ApiFailure {
    fn into_response(self) -> Response {
        (self.0, Json(ApiError { error: self.1 })).into_response()
    }
}

impl From<ProjectError> for ApiFailure {
    fn from(err: ProjectError) -> Self {
        let status = match &err {
            ProjectError::Folder(_) | ProjectError::BlankName | ProjectError::BlankTitle => {
                StatusCode::BAD_REQUEST
            }
            ProjectError::NotFound => StatusCode::NOT_FOUND,
            ProjectError::Db(e) => {
                tracing::error!(error = %e, "database error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        Self(status, err.to_string())
    }
}

type ApiResult<T> = Result<Json<T>, ApiFailure>;

async fn recent_projects(State(state): State<Arc<AppState>>) -> ApiResult<Vec<Project>> {
    Ok(Json(projects::recent_projects(&state.db).await?))
}

async fn open_project(
    State(state): State<Arc<AppState>>,
    Json(body): Json<OpenProjectRequest>,
) -> ApiResult<Project> {
    Ok(Json(projects::open_project(&state.db, &body.path).await?))
}

async fn get_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<Project> {
    Ok(Json(projects::get_project(&state.db, &id).await?))
}

async fn rename_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<RenameProjectRequest>,
) -> ApiResult<Project> {
    Ok(Json(
        projects::rename_project(&state.db, &id, &body.name).await?,
    ))
}

/// Removes a project from Forge with its sessions' records and logs and its
/// terminal. The folder on disk is not touched. Returns the deleted project.
async fn delete_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<Project> {
    let project = projects::get_project(&state.db, &id).await?;
    let sessions = projects::list_sessions(&state.db, &id).await?;
    if sessions.iter().any(|s| state.agent.is_running(&s.id)) {
        return Err(ApiFailure::new(
            StatusCode::CONFLICT,
            "a session in this workspace is still running; stop it first",
        ));
    }
    projects::delete_project(&state.db, &id).await?;
    for session in &sessions {
        state.agent.close_session(&session.id);
    }
    if let Some(log) = state.events.log() {
        for session in &sessions {
            if let Err(error) = log.remove(&session.id) {
                tracing::warn!(%error, session = %session.id, "cannot delete session log");
            }
        }
    }
    state.terminals.close_project(&id);
    Ok(Json(project))
}

/// Opens the project's folder in a program on the user's machine.
async fn open_project_in(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<OpenInRequest>,
) -> ApiResult<Project> {
    let project = projects::get_project(&state.db, &id).await?;
    let path = std::path::PathBuf::from(&project.path);
    tokio::task::spawn_blocking(move || folders::open_folder_in(body.app, &path))
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))?
        .map_err(ApiFailure::internal)?;
    Ok(Json(project))
}

/// Refuses work that needs the session idle.
fn ensure_idle(state: &AppState, session_id: &str, action: &str) -> Result<(), ApiFailure> {
    if state.agent.is_running(session_id) {
        return Err(ApiFailure::new(
            StatusCode::CONFLICT,
            format!("this session is still running; stop it before {action} it"),
        ));
    }
    Ok(())
}

/// Renames, pins or archives a session.
async fn update_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSessionRequest>,
) -> ApiResult<Session> {
    if body.archived == Some(true) {
        ensure_idle(&state, &id, "archiving")?;
    }
    let mut session = projects::update_session(
        &state.db,
        &id,
        body.title.as_deref(),
        body.pinned,
        body.archived,
    )
    .await?;
    if body.title.is_some() {
        state.events.publish(SessionEvent::SessionTitle {
            session_id: id.clone(),
            title: session.title.clone(),
            source: TitleSource::User,
        });
    }
    session.running = state.agent.is_running(&id);
    Ok(Json(session))
}

/// Deletes a session permanently, with its event log. Returns the deleted
/// session.
async fn delete_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<Session> {
    ensure_idle(&state, &id, "deleting")?;
    let session = projects::get_session(&state.db, &id).await?;
    projects::delete_session(&state.db, &id).await?;
    state.agent.close_session(&id);
    if let Some(log) = state.events.log() {
        if let Err(error) = log.remove(&id) {
            tracing::warn!(%error, session = %id, "cannot delete session log");
        }
    }
    Ok(Json(session))
}

/// Starts a new session from a copy of this one's conversation and events.
async fn fork_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<Session> {
    ensure_idle(&state, &id, "forking")?;
    let fork = projects::create_fork(&state.db, &id).await?;
    if let Some(log) = state.events.log() {
        if let Err(err) = log.fork(&id, &fork.id) {
            projects::delete_session(&state.db, &fork.id).await?;
            return Err(ApiFailure::internal(format!(
                "could not copy the session: {err}"
            )));
        }
    }
    Ok(Json(fork))
}

/// Most files listed in the workspace file tree.
const MAX_LISTED_FILES: usize = 20_000;

async fn project_files(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<FileList> {
    let project = projects::get_project(&state.db, &id).await?;
    let list = tokio::task::spawn_blocking(move || {
        services::workspace::list_files(std::path::Path::new(&project.path), MAX_LISTED_FILES)
    })
    .await
    .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(list))
}

/// The project's branch and how many files have changes.
async fn git_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<GitStatus> {
    let project = projects::get_project(&state.db, &id).await?;
    tokio::task::spawn_blocking(move || git::status(std::path::Path::new(&project.path)))
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))?
        .map(Json)
        .map_err(|message| ApiFailure(StatusCode::BAD_REQUEST, message))
}

/// Runs a git operation on project `id` off the async runtime; a git
/// failure is the user's to fix, so it is a bad request.
async fn in_project<T: Send + 'static>(
    state: &AppState,
    id: &str,
    op: impl FnOnce(&std::path::Path) -> Result<T, String> + Send + 'static,
) -> Result<T, ApiFailure> {
    let project = projects::get_project(&state.db, id).await?;
    tokio::task::spawn_blocking(move || op(std::path::Path::new(&project.path)))
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))?
        .map_err(|message| ApiFailure(StatusCode::BAD_REQUEST, message))
}

/// Creates and checks out a branch; returns the new status.
async fn create_branch(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateBranchRequest>,
) -> ApiResult<GitStatus> {
    in_project(&state, &id, move |dir| {
        git::create_branch(dir, &body.name)?;
        git::status(dir)
    })
    .await
    .map(Json)
}

/// Commits every change with the user's message.
async fn commit(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CommitRequest>,
) -> ApiResult<CommitResult> {
    in_project(&state, &id, move |dir| git::commit(dir, &body.message))
        .await
        .map(Json)
}

/// Pushes the current branch to its remote with the user's git
/// credentials.
async fn push(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> ApiResult<PushResult> {
    let token = crate::github::token(&state).await;
    in_project(&state, &id, move |dir| {
        git::push_with(dir, token.as_deref())
    })
    .await
    .map(Json)
}

/// Most of the diff the agent reads to draft a commit message.
const MAX_DRAFT_DIFF_BYTES: usize = 40_000;

/// Has the session's agent draft a commit message for the project's
/// uncommitted changes.
async fn draft_commit_message(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<CommitMessageDraft> {
    let session = projects::get_session(&state.db, &id).await?;
    crate::routes::ensure_open(&state, &id).await;
    let changes = in_project(&state, &session.project_id, |dir| {
        git::describe_changes(dir, MAX_DRAFT_DIFF_BYTES)
    })
    .await?;
    let message = state
        .agent
        .draft_commit_message(&id, &changes)
        .await
        .map_err(|err| ApiFailure(StatusCode::BAD_GATEWAY, err.to_string()))?;
    Ok(Json(CommitMessageDraft { message }))
}

/// Largest file the viewer shows.
const MAX_VIEWED_BYTES: usize = 2_000_000;

#[derive(Deserialize)]
struct FileQuery {
    path: String,
}

/// One project file for the read-only viewer. Paths outside the project
/// are refused, as for the agent's own tools.
async fn project_file(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<FileQuery>,
) -> ApiResult<FileContent> {
    let project = projects::get_project(&state.db, &id).await?;
    let tools = ToolBox::new(&project.path);
    let rel = query.path;
    let read = tokio::task::spawn_blocking(move || {
        let path = tools.project_path(&rel)?;
        Ok::<_, String>((path, tools.read_text(&rel)?))
    })
    .await
    .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match read {
        Ok((path, Some(content))) if content.len() > MAX_VIEWED_BYTES => Err(ApiFailure(
            StatusCode::BAD_REQUEST,
            format!("{path} is too large to show ({} bytes)", content.len()),
        )),
        Ok((path, Some(content))) => Ok(Json(FileContent { path, content })),
        Ok((path, None)) => Err(ApiFailure(
            StatusCode::NOT_FOUND,
            format!("{path} does not exist"),
        )),
        Err(message) => Err(ApiFailure(StatusCode::BAD_REQUEST, message)),
    }
}

/// The models to pick from, with the saved default model pre-selected
/// when it is still offered.
async fn model_catalog(State(state): State<Arc<AppState>>) -> Json<ModelCatalog> {
    Json(catalog(&state).await)
}

async fn catalog(state: &AppState) -> ModelCatalog {
    let mut catalog = state.agent.providers().catalog();
    if let Some(model) = crate::settings::defaults(state).await.model {
        if state
            .agent
            .providers()
            .check_usable(&(&model).into())
            .is_ok()
        {
            catalog.default = Some(state.agent.providers().fit_session_model(model));
        }
    }
    catalog
}

/// Why a session cannot start with a model: a provider without a key is a
/// conflict the user fixes in Settings, anything else a bad request.
fn unusable_model(err: ModelError) -> ApiFailure {
    let status = match err {
        ModelError::MissingApiKey { .. } | ModelError::NoProvider => StatusCode::CONFLICT,
        _ => StatusCode::BAD_REQUEST,
    };
    ApiFailure(status, err.to_string())
}

/// Creates a session with the chosen model, or the catalog default. Refused
/// before anything is stored when no configured provider can serve it.
async fn create_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    body: Option<Json<CreateSessionRequest>>,
) -> ApiResult<Session> {
    let body = body.map(|Json(body)| body).unwrap_or_default();
    let defaults = crate::settings::defaults(&state).await;
    let approval_mode = body.approval_mode.unwrap_or(defaults.approval_mode);
    let choice = match body.model {
        Some(model) => model,
        None => catalog(&state)
            .await
            .default
            .ok_or_else(|| unusable_model(ModelError::NoProvider))?,
    };
    state
        .agent
        .providers()
        .check_usable(&(&choice).into())
        .map_err(unusable_model)?;
    let (mut session, folder) = projects::create_session(&state.db, &id, Some(&choice)).await?;
    if approval_mode != session.approval_mode {
        session = projects::set_approval_mode(&state.db, &session.id, approval_mode).await?;
    }
    let cwd = folder.to_string_lossy().into_owned();
    state
        .agent
        .open_session_with(&session.id, ToolBox::new(folder), &(&choice).into())
        .map_err(|err| ApiFailure(StatusCode::BAD_REQUEST, err.to_string()))?;
    state
        .agent
        .set_approval_mode(&session.id, session.approval_mode);
    state.events.publish(SessionEvent::SessionStarted {
        session_id: session.id.clone(),
        cwd,
        provider: choice.provider.clone(),
        model: choice.model.clone(),
        approval_mode: session.approval_mode,
        sandbox: state.agent.sandbox_info(&session.id),
    });
    Ok(Json(session))
}

/// The sandbox and writable folders of a session's commands.
async fn session_sandbox(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<SandboxInfo> {
    crate::routes::ensure_open(&state, &id).await;
    state
        .agent
        .sandbox_info(&id)
        .map(Json)
        .ok_or_else(|| ApiFailure(StatusCode::NOT_FOUND, "session not found".into()))
}

/// Changes a session's approval mode; the agent uses it from its next
/// action, and every open tab hears about it.
async fn set_approval_mode(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<SetApprovalModeRequest>,
) -> ApiResult<Session> {
    let mut session = projects::set_approval_mode(&state.db, &id, body.mode).await?;
    crate::routes::ensure_open(&state, &id).await;
    state.agent.set_approval_mode(&id, body.mode);
    state.events.publish(SessionEvent::ApprovalModeChanged {
        session_id: id.clone(),
        mode: body.mode,
    });
    session.running = state.agent.is_running(&id);
    Ok(Json(session))
}

/// Changes a session's model between turns; the next message uses it.
async fn set_session_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<SetSessionModelRequest>,
) -> ApiResult<Session> {
    let choice = (&body.model).into();
    state
        .agent
        .providers()
        .check_usable(&choice)
        .map_err(unusable_model)?;
    crate::routes::ensure_open(&state, &id).await;
    if state.agent.is_running(&id) {
        return Err(ApiFailure(
            StatusCode::CONFLICT,
            "the model can change once this turn has finished".into(),
        ));
    }
    let session = projects::set_session_model(&state.db, &id, &body.model).await?;
    state
        .agent
        .set_model(&id, &choice)
        .map_err(|err| ApiFailure(StatusCode::BAD_REQUEST, err.to_string()))?;
    Ok(Json(session))
}

async fn list_sessions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<Vec<Session>> {
    let mut sessions = projects::list_sessions(&state.db, &id).await?;
    for session in &mut sessions {
        session.running = state.agent.is_running(&session.id);
    }
    Ok(Json(sessions))
}

#[derive(Deserialize)]
struct EventsQuery {
    after: Option<u64>,
    before: Option<u64>,
    limit: Option<usize>,
}

/// The most events one tail page returns.
const MAX_EVENTS_PAGE: usize = 500;

/// Which events a request asks for.
enum EventsPage {
    After(u64),
    Before { before: Option<u64>, limit: usize },
}

impl EventsQuery {
    fn page(&self) -> Result<EventsPage, String> {
        match (self.after, self.before, self.limit) {
            (Some(_), Some(_), _) | (Some(_), _, Some(_)) => {
                Err("use either after or before/limit, not both".into())
            }
            (after, None, None) => Ok(EventsPage::After(after.unwrap_or(0))),
            (None, before, limit) => {
                let limit = limit.unwrap_or(MAX_EVENTS_PAGE);
                if limit == 0 || limit > MAX_EVENTS_PAGE {
                    return Err(format!("limit must be between 1 and {MAX_EVENTS_PAGE}"));
                }
                Ok(EventsPage::Before { before, limit })
            }
        }
    }
}

/// A session's logged events: those after `?after=` (default: all), so a
/// browser can catch up after connecting or reconnecting, or a page of
/// the latest events before `?before=` (default: the newest) of at most
/// `?limit=`, so a long session can open at its tail.
async fn session_events(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<EventsQuery>,
) -> ApiResult<Vec<SessionEnvelope>> {
    let known = db::get_session(&state.db, &id)
        .await
        .map_err(ProjectError::from)?
        .is_some();
    if !known {
        return Err(ApiFailure(
            StatusCode::NOT_FOUND,
            "session not found".into(),
        ));
    }
    let page = query
        .page()
        .map_err(|message| ApiFailure(StatusCode::BAD_REQUEST, message))?;
    // Opening restores the session, closing a turn the server cut off.
    crate::routes::ensure_open(&state, &id).await;
    let Some(log) = state.events.log().cloned() else {
        return Ok(Json(Vec::new()));
    };
    let events = tokio::task::spawn_blocking(move || match page {
        EventsPage::After(after) => log.events_after(&id, after),
        EventsPage::Before { before, limit } => log.events_before(&id, before, limit),
    })
    .await
    .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(events))
}

/// Every event a known session has logged, oldest first.
async fn whole_log(state: &AppState, id: &str) -> Result<Vec<SessionEnvelope>, ApiFailure> {
    let known = db::get_session(&state.db, id)
        .await
        .map_err(ProjectError::from)?
        .is_some();
    if !known {
        return Err(ApiFailure(
            StatusCode::NOT_FOUND,
            "session not found".into(),
        ));
    }
    let Some(log) = state.events.log().cloned() else {
        return Ok(Vec::new());
    };
    let id = id.to_string();
    tokio::task::spawn_blocking(move || log.events_after(&id, 0))
        .await
        .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// A session's totals for the composer metrics and Statistics view,
/// folded from its whole log, so paging the browser's view changes none.
async fn session_stats(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<api_types::SessionStats> {
    let events = whole_log(&state, &id).await?;
    Ok(Json(services::stats::fold(events.iter().map(|e| &e.event))))
}

/// The files the agent changed in a session, each with its latest diff,
/// folded from the whole log, so a browser that loaded only the session's
/// tail still lists every change.
async fn session_changes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<Vec<api_types::FileChange>> {
    let events = whole_log(&state, &id).await?;
    let mut files: Vec<api_types::FileChange> = Vec::new();
    for envelope in events {
        match envelope.event {
            SessionEvent::FileChanged {
                path,
                diff,
                additions,
                deletions,
                ..
            } => {
                let at = files.iter().position(|f| f.path == path);
                if diff.is_empty() {
                    if let Some(at) = at {
                        files.remove(at);
                    }
                    continue;
                }
                let change = api_types::FileChange {
                    path,
                    diff,
                    additions,
                    deletions,
                };
                match at {
                    Some(at) => files[at] = change,
                    None => files.push(change),
                }
            }
            SessionEvent::ChangesReverted { .. } => files.clear(),
            _ => {}
        }
    }
    Ok(Json(files))
}

/// Shows the operating system's folder dialog on the user's machine and
/// waits for their choice.
async fn pick_folder() -> ApiResult<PickedFolder> {
    let path = tokio::task::spawn_blocking(folders::pick_folder)
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))?
        .map_err(ApiFailure::internal)?;
    Ok(Json(PickedFolder { path }))
}

#[cfg(test)]
mod tests {
    use api_types::ReasoningEffort;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use agent::{
        model::{ModelClient, ModelError, ModelEvent, ModelRequest},
        Agent,
    };
    use api_types::SessionEvent;
    use reqwest::StatusCode;
    use serde_json::{json, Value};
    use services::{log::SessionLog, EventService};
    use tokio::sync::mpsc;

    use super::*;

    struct NoModel;

    impl ModelClient for NoModel {
        fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
            mpsc::channel(1).1
        }
    }

    /// A temp folder holding `repo` (a git repository) and `plain`.
    fn folders() -> PathBuf {
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "forge-api-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(dir.join("repo/.git")).unwrap();
        fs::create_dir_all(dir.join("plain")).unwrap();
        dir.canonicalize().unwrap()
    }

    /// Never finishes a reply, so a started turn keeps running.
    #[derive(Default)]
    struct HangModel(std::sync::Mutex<Vec<mpsc::Sender<Result<ModelEvent, ModelError>>>>);

    impl ModelClient for HangModel {
        fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
            let (tx, rx) = mpsc::channel(1);
            self.0.lock().unwrap().push(tx);
            rx
        }
    }

    async fn start() -> (String, Arc<AppState>) {
        start_with(Arc::new(NoModel)).await
    }

    async fn start_with(model: Arc<dyn ModelClient>) -> (String, Arc<AppState>) {
        let log = SessionLog::open(folders().join("logs")).unwrap();
        let events = EventService::with_log(Arc::new(log));
        let state = Arc::new(AppState {
            db: db::connect(":memory:").await.unwrap(),
            agent: Agent::new(model, events.clone()),
            events,
            terminals: Default::default(),
            settings: Default::default(),
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .nest("/api", router())
            .with_state(state.clone());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}/api"), state)
    }

    async fn post_json(url: &str, body: Value) -> (StatusCode, Value) {
        let res = reqwest::Client::new()
            .post(url)
            .json(&body)
            .send()
            .await
            .unwrap();
        (res.status(), res.json().await.unwrap())
    }

    async fn get_json(url: &str) -> (StatusCode, Value) {
        let res = reqwest::get(url).await.unwrap();
        (res.status(), res.json().await.unwrap())
    }

    #[tokio::test]
    async fn opening_a_folder_lists_it_as_a_recent_project() {
        let (api, _) = start().await;
        let dir = folders();
        let repo = dir.join("repo");

        let (status, project) =
            post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(project["name"], "repo");
        assert_eq!(project["path"], repo.to_string_lossy().as_ref());

        let (status, recent) = get_json(&format!("{api}/projects")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(recent, json!([project.clone()]));

        let id = project["id"].as_str().unwrap();
        assert_eq!(
            get_json(&format!("{api}/projects/{id}")).await,
            (StatusCode::OK, project)
        );
    }

    #[tokio::test]
    async fn opening_a_folder_that_is_not_a_repository_is_a_bad_request() {
        let (api, _) = start().await;
        let plain = folders().join("plain");

        let (status, body) = post_json(&format!("{api}/projects"), json!({ "path": plain })).await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            body,
            json!({ "error": "that folder is not a git repository" })
        );
    }

    #[tokio::test]
    async fn an_unknown_project_is_not_found() {
        let (api, _) = start().await;
        let (status, body) = get_json(&format!("{api}/projects/nope")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body, json!({ "error": "project not found" }));
        let (status, _) = post_json(&format!("{api}/projects/nope/sessions"), json!({})).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn creating_a_session_opens_it_for_the_agent() {
        let (api, state) = start().await;
        let repo = folders().join("repo");
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        let id = project["id"].as_str().unwrap();

        let (status, session) =
            post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(session["project_id"], id);
        assert_eq!(session["title"], "New session");
        assert!(state.agent.is_open(session["id"].as_str().unwrap()));
    }

    /// A provider with two models, so a session can pick one.
    struct TwoModels;

    impl agent::providers::ModelProvider for TwoModels {
        fn id(&self) -> &str {
            "stub"
        }
        fn name(&self) -> &str {
            "Stub"
        }
        fn models(&self) -> Vec<agent::providers::ModelInfo> {
            ["fast", "smart"]
                .into_iter()
                .map(|id| agent::providers::ModelInfo {
                    id: id.into(),
                    name: id.to_uppercase(),
                    efforts: if id == "fast" {
                        vec![ReasoningEffort::Low, ReasoningEffort::Medium]
                    } else {
                        ReasoningEffort::ALL.to_vec()
                    },
                    context_window: None,
                })
                .collect()
        }
        fn client(&self, _: &str) -> Arc<dyn ModelClient> {
            Arc::new(NoModel)
        }
    }

    async fn start_with_models() -> (String, Arc<AppState>) {
        let mut providers = agent::providers::Providers::new();
        providers.register(Arc::new(TwoModels));
        start_with_providers(providers).await
    }

    async fn start_with_providers(
        providers: agent::providers::Providers,
    ) -> (String, Arc<AppState>) {
        let log = SessionLog::open(folders().join("logs")).unwrap();
        let events = EventService::with_log(Arc::new(log));
        let state = Arc::new(AppState {
            db: db::connect(":memory:").await.unwrap(),
            agent: Agent::with_providers(providers, events.clone()),
            events,
            terminals: Default::default(),
            settings: Default::default(),
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .nest("/api", router().merge(crate::settings::router()))
            .with_state(state.clone());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}/api"), state)
    }

    async fn new_project(api: &str) -> String {
        let repo = folders().join("repo");
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        project["id"].as_str().unwrap().to_string()
    }

    #[tokio::test]
    async fn the_model_catalog_lists_providers_models_and_efforts() {
        let (api, _) = start_with_models().await;

        let (status, catalog) = get_json(&format!("{api}/models")).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            catalog,
            json!({
                "providers": [{ "id": "stub", "name": "Stub", "models": [
                    { "id": "fast", "name": "FAST", "efforts": ["low", "medium"] },
                    { "id": "smart", "name": "SMART",
                      "efforts": ["low", "medium", "high", "xhigh", "max"] }
                ]}],
                "default": { "provider": "stub", "model": "fast", "effort": "low" }
            })
        );
    }

    #[tokio::test]
    async fn a_saved_default_moves_to_an_effort_its_model_offers() {
        let (api, _) = start_with_models().await;
        let defaults = json!({
            "model": { "provider": "stub", "model": "fast", "effort": "max" },
            "approval_mode": "ask"
        });
        put_json(&format!("{api}/settings/defaults"), defaults).await;

        let (_, catalog) = get_json(&format!("{api}/models")).await;

        assert_eq!(
            catalog["default"],
            json!({ "provider": "stub", "model": "fast", "effort": "low" })
        );
    }

    #[tokio::test]
    async fn a_session_is_created_with_the_chosen_model_and_keeps_it() {
        let (api, _) = start_with_models().await;
        let id = new_project(&api).await;
        let sessions = format!("{api}/projects/{id}/sessions");

        let (status, first) = post_json(
            &sessions,
            json!({ "model": { "provider": "stub", "model": "smart", "effort": "max" } }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            first["model"],
            json!({ "provider": "stub", "model": "smart", "effort": "max" })
        );

        // A second session with another model leaves the first unchanged.
        let (_, second) = post_json(
            &sessions,
            json!({ "model": { "provider": "stub", "model": "fast", "effort": "low" } }),
        )
        .await;
        let (_, listed) = get_json(&sessions).await;
        let model_of = |sid: &Value| {
            listed
                .as_array()
                .unwrap()
                .iter()
                .find(|s| s["id"] == *sid)
                .unwrap()["model"]
                .clone()
        };
        assert_eq!(model_of(&first["id"])["model"], "smart");
        assert_eq!(model_of(&second["id"])["model"], "fast");
        assert_eq!(model_of(&second["id"])["effort"], "low");
    }

    /// A server as a fresh install runs it: Anthropic registered, no key.
    async fn start_without_a_key() -> (String, agent::providers::KeyHandle) {
        let anthropic = agent::anthropic::AnthropicProvider::new(None);
        let key = anthropic.key_handle();
        let mut providers = agent::providers::Providers::new();
        providers.register(Arc::new(anthropic));
        let (api, _) = start_with_providers(providers).await;
        (api, key)
    }

    #[tokio::test]
    async fn a_fresh_install_offers_no_model_and_refuses_a_session() {
        let (api, _key) = start_without_a_key().await;
        let id = new_project(&api).await;
        let sessions = format!("{api}/projects/{id}/sessions");

        let (status, catalog) = get_json(&format!("{api}/models")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(catalog["default"], Value::Null);
        assert_eq!(catalog["providers"], json!([]));

        let (status, body) = post_json(&sessions, json!({})).await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert!(
            body["error"].as_str().unwrap().contains("Settings"),
            "{body}"
        );

        // Naming a model does not get around it, and the message names the
        // provider that needs a key.
        let pick = json!({ "model": {
            "provider": "anthropic", "model": "claude-opus-5-5", "effort": "high"
        }});
        let (status, body) = post_json(&sessions, pick).await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert!(
            body["error"].as_str().unwrap().contains("Anthropic"),
            "{body}"
        );

        let (_, listed) = get_json(&sessions).await;
        assert_eq!(listed, json!([]), "nothing was stored");
    }

    #[tokio::test]
    async fn adding_a_key_makes_the_provider_available() {
        let (api, key) = start_without_a_key().await;
        let id = new_project(&api).await;

        *key.write().unwrap() = Some("sk-1".into());

        let (_, catalog) = get_json(&format!("{api}/models")).await;
        assert_eq!(catalog["default"]["provider"], "anthropic");
        let (status, session) =
            post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(session["model"]["provider"], "anthropic");
    }

    #[tokio::test]
    async fn saved_defaults_for_a_provider_without_a_key_are_ignored_and_refused() {
        let (api, key) = start_without_a_key().await;
        *key.write().unwrap() = Some("sk-1".into());
        let defaults = json!({
            "model": { "provider": "anthropic", "model": "claude-sonnet-5-5", "effort": "low" },
            "approval_mode": "ask"
        });
        let (status, _) = put_json(&format!("{api}/settings/defaults"), defaults.clone()).await;
        assert_eq!(status, StatusCode::OK);

        *key.write().unwrap() = None;

        let (_, catalog) = get_json(&format!("{api}/models")).await;
        assert_eq!(catalog["default"], Value::Null);
        let (status, _) = put_json(&format!("{api}/settings/defaults"), defaults).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn a_session_without_a_choice_gets_the_default_model() {
        let (api, _) = start_with_models().await;
        let id = new_project(&api).await;

        let (_, session) = post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;

        assert_eq!(
            session["model"],
            json!({ "provider": "stub", "model": "fast", "effort": "low" })
        );
    }

    #[tokio::test]
    async fn saved_defaults_preselect_new_sessions_and_leave_old_ones_alone() {
        let (api, state) = start_with_models().await;
        let id = new_project(&api).await;
        let sessions = format!("{api}/projects/{id}/sessions");
        let (_, before) = post_json(&sessions, json!({})).await;

        let defaults = json!({
            "model": { "provider": "stub", "model": "smart", "effort": "low" },
            "approval_mode": "full_auto"
        });
        let (status, saved) = put_json(&format!("{api}/settings/defaults"), defaults.clone()).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(saved, defaults);
        let (_, got) = get_json(&format!("{api}/settings/defaults")).await;
        assert_eq!(got, defaults);

        // The session start UI is pre-set from the catalog default.
        let (_, catalog) = get_json(&format!("{api}/models")).await;
        assert_eq!(catalog["default"], defaults["model"]);

        let (_, after) = post_json(&sessions, json!({})).await;
        assert_eq!(after["model"], defaults["model"]);
        assert_eq!(after["approval_mode"], "full_auto");
        assert_eq!(
            state.agent.approval_mode(after["id"].as_str().unwrap()),
            Some(api_types::ApprovalMode::FullAuto)
        );

        // A session that already existed keeps what it started with.
        let (_, listed) = get_json(&sessions).await;
        let old = listed
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == before["id"])
            .unwrap()
            .clone();
        assert_eq!(old["model"], before["model"]);
        assert_eq!(old["approval_mode"], "ask");
    }

    #[tokio::test]
    async fn defaults_with_an_unknown_model_are_refused() {
        let (api, _) = start_with_models().await;
        let (status, _) = put_json(
            &format!("{api}/settings/defaults"),
            json!({ "model": { "provider": "stub", "model": "nope", "effort": "low" }, "approval_mode": "ask" }),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let (_, got) = get_json(&format!("{api}/settings/defaults")).await;
        assert_eq!(got, json!({ "model": null, "approval_mode": "ask" }));
    }

    #[tokio::test]
    async fn an_unknown_model_is_a_bad_request_and_creates_nothing() {
        let (api, _) = start_with_models().await;
        let id = new_project(&api).await;
        let sessions = format!("{api}/projects/{id}/sessions");

        let (status, body) = post_json(
            &sessions,
            json!({ "model": { "provider": "stub", "model": "nope", "effort": "high" } }),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("nope"), "{body}");
        let (_, listed) = get_json(&sessions).await;
        assert_eq!(listed, json!([]));
    }

    async fn put_json(url: &str, body: Value) -> (StatusCode, Value) {
        let res = reqwest::Client::new()
            .put(url)
            .json(&body)
            .send()
            .await
            .unwrap();
        (res.status(), res.json().await.unwrap())
    }

    #[tokio::test]
    async fn a_new_session_asks_and_its_approval_mode_can_be_changed() {
        let (api, state) = start().await;
        let id = new_project(&api).await;
        let mut rx = state.events.subscribe();
        let (_, session) = post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;
        let sid = session["id"].as_str().unwrap().to_string();
        assert_eq!(session["approval_mode"], "ask");
        assert_eq!(
            state.agent.approval_mode(&sid),
            Some(api_types::ApprovalMode::Ask)
        );

        let (status, changed) = put_json(
            &format!("{api}/sessions/{sid}/approval-mode"),
            json!({ "mode": "auto_edit" }),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(changed["approval_mode"], "auto_edit");
        assert_eq!(
            state.agent.approval_mode(&sid),
            Some(api_types::ApprovalMode::AutoEdit)
        );
        // Past the session's own start record.
        let event = loop {
            let event = tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv())
                .await
                .unwrap()
                .unwrap()
                .event;
            if !matches!(event, SessionEvent::SessionStarted { .. }) {
                break event;
            }
        };
        assert!(matches!(
            event,
            SessionEvent::ApprovalModeChanged {
                mode: api_types::ApprovalMode::AutoEdit,
                ..
            }
        ));
        let (_, listed) = get_json(&format!("{api}/projects/{id}/sessions")).await;
        assert_eq!(listed[0]["approval_mode"], "auto_edit");
    }

    #[tokio::test]
    async fn a_session_can_change_model_and_an_unusable_choice_changes_nothing() {
        let (api, _) = start_with_models().await;
        let id = new_project(&api).await;
        let (_, session) = post_json(
            &format!("{api}/projects/{id}/sessions"),
            json!({ "model": { "provider": "stub", "model": "smart", "effort": "max" } }),
        )
        .await;
        let sid = session["id"].as_str().unwrap();
        let url = format!("{api}/sessions/{sid}/model");

        let (status, changed) = put_json(
            &url,
            json!({ "model": { "provider": "stub", "model": "fast", "effort": "low" } }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(changed["model"]["model"], "fast");

        let (status, _) = put_json(
            &url,
            json!({ "model": { "provider": "stub", "model": "nope", "effort": "low" } }),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let (_, listed) = get_json(&format!("{api}/projects/{id}/sessions")).await;
        assert_eq!(
            listed[0]["model"],
            json!({ "provider": "stub", "model": "fast", "effort": "low" })
        );

        let (status, _) = put_json(
            &format!("{api}/sessions/nope/model"),
            json!({ "model": { "provider": "stub", "model": "fast", "effort": "low" } }),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn changing_the_mode_of_an_unknown_session_is_not_found() {
        let (api, _) = start().await;
        let (status, _) = put_json(
            &format!("{api}/sessions/nope/approval-mode"),
            json!({ "mode": "ask" }),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_session_reopened_after_a_restart_keeps_its_mode() {
        let (api, state) = start().await;
        let id = new_project(&api).await;
        let (_, session) = post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;
        let sid = session["id"].as_str().unwrap().to_string();
        put_json(
            &format!("{api}/sessions/{sid}/approval-mode"),
            json!({ "mode": "full_auto" }),
        )
        .await;

        // A fresh agent, as after a restart, sharing the same database.
        let restarted = AppState {
            db: state.db.clone(),
            events: EventService::new(),
            agent: Agent::new(Arc::new(NoModel), EventService::new()),
            terminals: Default::default(),
            settings: Default::default(),
        };
        crate::routes::ensure_open(&restarted, &sid).await;
        assert_eq!(
            restarted.agent.approval_mode(&sid),
            Some(api_types::ApprovalMode::FullAuto)
        );
    }

    #[tokio::test]
    async fn a_project_lists_its_files_and_serves_one() {
        let (api, _) = start().await;
        let repo = folders().join("repo");
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        let pid = project["id"].as_str().unwrap();
        fs::create_dir_all(repo.join("src")).unwrap();
        fs::write(repo.join("src/main.rs"), "fn main() {}\n").unwrap();

        let (status, list) = get_json(&format!("{api}/projects/{pid}/files")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(list["files"], json!(["src/main.rs"]));
        assert_eq!(list["truncated"], false);

        let (status, file) =
            get_json(&format!("{api}/projects/{pid}/file?path=src%2Fmain.rs")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            file,
            json!({ "path": "src/main.rs", "content": "fn main() {}\n" })
        );
    }

    #[tokio::test]
    async fn the_file_viewer_refuses_paths_outside_and_reports_missing_files() {
        let (api, _) = start().await;
        let repo = folders().join("repo");
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        let pid = project["id"].as_str().unwrap();
        fs::write(repo.join("bin.dat"), [0xff, 0xfe, 0x00]).unwrap();

        let (status, body) = get_json(&format!(
            "{api}/projects/{pid}/file?path=..%2F..%2Fetc%2Fpasswd"
        ))
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(
            body["error"].as_str().unwrap().contains("outside"),
            "{body}"
        );

        let (status, _) = get_json(&format!("{api}/projects/{pid}/file?path=nope.txt")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);

        let (status, body) = get_json(&format!("{api}/projects/{pid}/file?path=bin.dat")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("UTF-8"), "{body}");

        fs::write(repo.join("big.txt"), "x".repeat(MAX_VIEWED_BYTES + 1)).unwrap();
        let (status, body) = get_json(&format!("{api}/projects/{pid}/file?path=big.txt")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(
            body["error"].as_str().unwrap().contains("too large"),
            "{body}"
        );

        let (status, _) = get_json(&format!("{api}/projects/zzz/files")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_project_reports_its_branch_and_changes() {
        let (api, _) = start().await;
        let repo = folders().join("real");
        fs::create_dir_all(&repo).unwrap();
        let git = |args: &[&str]| {
            assert!(std::process::Command::new("git")
                .args(args)
                .current_dir(&repo)
                .status()
                .unwrap()
                .success());
        };
        git(&["init", "-q", "-b", "trunk"]);
        fs::write(repo.join("a.txt"), "a").unwrap();
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        let pid = project["id"].as_str().unwrap();

        let (status, body) = get_json(&format!("{api}/projects/{pid}/git/status")).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body,
            json!({ "branch": "trunk", "detached": false, "staged": 0, "changed": 1 })
        );
    }

    #[tokio::test]
    async fn git_status_of_a_broken_repository_is_an_error() {
        let (api, _) = start().await;
        // `folders()` repos have an empty .git folder: not a usable repo.
        let repo = folders().join("repo");
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        let pid = project["id"].as_str().unwrap();
        let (status, body) = get_json(&format!("{api}/projects/{pid}/git/status")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].is_string());
    }

    /// A real repository with one commit, opened as a project.
    async fn git_project(api: &str) -> (String, PathBuf) {
        let repo = folders().join("gitrepo");
        fs::create_dir_all(&repo).unwrap();
        for args in [
            &["init", "-q", "-b", "main"][..],
            &["config", "user.name", "Test"],
            &["config", "user.email", "test@example.com"],
        ] {
            assert!(std::process::Command::new("git")
                .args(args)
                .current_dir(&repo)
                .status()
                .unwrap()
                .success());
        }
        fs::write(repo.join("a.txt"), "a\n").unwrap();
        for args in [&["add", "."][..], &["commit", "-q", "-m", "first"]] {
            assert!(std::process::Command::new("git")
                .args(args)
                .current_dir(&repo)
                .status()
                .unwrap()
                .success());
        }
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        (project["id"].as_str().unwrap().to_string(), repo)
    }

    #[tokio::test]
    async fn a_branch_is_created_and_shown_in_the_status() {
        let (api, _) = start().await;
        let (pid, _) = git_project(&api).await;

        let (status, body) = post_json(
            &format!("{api}/projects/{pid}/git/branch"),
            json!({ "name": "feat/x" }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["branch"], "feat/x");

        let (status, body) = post_json(
            &format!("{api}/projects/{pid}/git/branch"),
            json!({ "name": "bad name" }),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("not a valid"));
    }

    #[tokio::test]
    async fn committing_from_the_browser_lands_in_the_log() {
        let (api, _) = start().await;
        let (pid, repo) = git_project(&api).await;
        fs::write(repo.join("a.txt"), "b\n").unwrap();

        let (status, body) = post_json(
            &format!("{api}/projects/{pid}/git/commit"),
            json!({ "message": "fix: change a" }),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["summary"], "fix: change a");
        let log = std::process::Command::new("git")
            .args(["log", "-1", "--format=%s"])
            .current_dir(&repo)
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&log.stdout).trim(), "fix: change a");

        let (status, body) = post_json(
            &format!("{api}/projects/{pid}/git/commit"),
            json!({ "message": "again" }),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"]
            .as_str()
            .unwrap()
            .contains("nothing to commit"));
    }

    #[tokio::test]
    async fn pushing_from_the_browser_reports_the_remote_or_the_error() {
        let (api, _) = start().await;
        let (pid, repo) = git_project(&api).await;

        // No remote yet: the error says so.
        let (status, body) = post_json(&format!("{api}/projects/{pid}/git/push"), json!({})).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(
            body["error"].as_str().unwrap().contains("no remote"),
            "{body}"
        );

        let remote = folders().join("remote.git");
        assert!(std::process::Command::new("git")
            .args(["init", "-q", "--bare", remote.to_str().unwrap()])
            .status()
            .unwrap()
            .success());
        assert!(std::process::Command::new("git")
            .args(["remote", "add", "origin", remote.to_str().unwrap()])
            .current_dir(&repo)
            .status()
            .unwrap()
            .success());

        let (status, body) = post_json(&format!("{api}/projects/{pid}/git/push"), json!({})).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body,
            json!({ "remote": "origin", "url": remote.to_str().unwrap(), "branch": "main" })
        );
    }

    /// Replies with a fixed commit message.
    struct Drafter;
    impl ModelClient for Drafter {
        fn stream(&self, _: ModelRequest) -> mpsc::Receiver<Result<ModelEvent, ModelError>> {
            let (tx, rx) = mpsc::channel(1);
            tokio::spawn(async move {
                let _ = tx
                    .send(Ok(ModelEvent::TextDelta("feat: draft".into())))
                    .await;
            });
            rx
        }
    }

    #[tokio::test]
    async fn the_agent_drafts_a_commit_message_for_a_session() {
        let (api, _) = start_with(Arc::new(Drafter)).await;
        let (pid, repo) = git_project(&api).await;
        fs::write(repo.join("a.txt"), "changed\n").unwrap();
        let (_, session) = post_json(&format!("{api}/projects/{pid}/sessions"), json!({})).await;
        let sid = session["id"].as_str().unwrap();

        let (status, body) =
            post_json(&format!("{api}/sessions/{sid}/commit-message"), json!({})).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, json!({ "message": "feat: draft" }));

        let (status, _) =
            post_json(&format!("{api}/sessions/nope/commit-message"), json!({})).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_session_reports_its_sandbox() {
        let (api, _) = start().await;
        let id = new_project(&api).await;
        let (_, session) = post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;
        let sid = session["id"].as_str().unwrap();

        let (status, body) = get_json(&format!("{api}/sessions/{sid}/sandbox")).await;

        assert_eq!(status, StatusCode::OK);
        // Test servers run without a sandbox.
        assert_eq!(body["name"], "none");
        assert_eq!(body["writable"].as_array().unwrap().len(), 1);
        assert_eq!(body["network"], false);

        let (status, _) = get_json(&format!("{api}/sessions/nope/sandbox")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    async fn send(method: reqwest::Method, url: &str, body: Value) -> (StatusCode, Value) {
        let res = reqwest::Client::new()
            .request(method, url)
            .json(&body)
            .send()
            .await
            .unwrap();
        (res.status(), res.json().await.unwrap())
    }

    #[tokio::test]
    async fn a_renamed_project_keeps_its_name_when_its_folder_is_reopened() {
        let (api, _) = start().await;
        let repo = folders().join("repo");
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        let url = format!("{api}/projects/{}", project["id"].as_str().unwrap());

        let (status, renamed) = send(
            reqwest::Method::PATCH,
            &url,
            json!({ "name": "  My app  " }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(renamed["name"], "My app");

        let (_, reopened) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        assert_eq!(reopened["id"], project["id"]);
        assert_eq!(reopened["name"], "My app");

        let (status, body) = send(reqwest::Method::PATCH, &url, json!({ "name": "  " })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("empty"));
    }

    #[tokio::test]
    async fn deleting_a_workspace_forgets_its_sessions_and_keeps_the_folder() {
        let (api, state) = start().await;
        let (project_id, sessions) = project_with_sessions(&api, 2).await;
        let first = sessions[0]["id"].as_str().unwrap();
        let log = state.events.log().unwrap();
        log.append_event(&SessionEvent::Done {
            session_id: first.to_string(),
        })
        .unwrap();
        // Its start record and the event above.
        assert_eq!(log.events_after(first, 0).unwrap().len(), 2);
        let (_, project) = get_json(&format!("{api}/projects/{project_id}")).await;
        let folder = PathBuf::from(project["path"].as_str().unwrap());
        let url = format!("{api}/projects/{project_id}");

        let (status, deleted) = send(reqwest::Method::DELETE, &url, json!({})).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(deleted["id"], project_id.as_str());
        assert!(folder.join(".git").exists());
        assert_eq!(log.events_after(first, 0).unwrap().len(), 0);
        let (status, _) = get_json(&url).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        let (status, _) = get_json(&format!("{api}/sessions/{first}/sandbox")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        let (status, _) = send(reqwest::Method::DELETE, &url, json!({})).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn sessions_can_be_renamed_pinned_and_archived_without_counting_as_activity() {
        let (api, _) = start().await;
        let (project_id, sessions) = project_with_sessions(&api, 2).await;
        let sid = sessions[0]["id"].as_str().unwrap();
        let url = format!("{api}/sessions/{sid}");

        let (status, renamed) =
            send(reqwest::Method::PATCH, &url, json!({ "title": " Mine " })).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(renamed["title"], "Mine");
        assert_eq!(renamed["updated_at"], sessions[0]["updated_at"]);

        let (status, body) = send(reqwest::Method::PATCH, &url, json!({ "title": " " })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("empty"));

        let (_, pinned) = send(reqwest::Method::PATCH, &url, json!({ "pinned": true })).await;
        assert_eq!(pinned["pinned"], true);
        assert_eq!(pinned["title"], "Mine");
        let (_, listed) = get_json(&format!("{api}/projects/{project_id}/sessions")).await;
        assert_eq!(listed[0]["id"], sid);

        let (_, archived) = send(reqwest::Method::PATCH, &url, json!({ "archived": true })).await;
        assert_eq!(archived["archived"], true);
        let (_, restored) = send(reqwest::Method::PATCH, &url, json!({ "archived": false })).await;
        assert_eq!(restored["archived"], false);
        assert_eq!(restored["pinned"], true);

        let (status, _) = send(
            reqwest::Method::PATCH,
            &format!("{api}/sessions/nope"),
            json!({ "pinned": true }),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_fork_copies_the_history_under_its_own_id() {
        let (api, state) = start().await;
        let (project_id, sessions) = project_with_sessions(&api, 1).await;
        let sid = sessions[0]["id"].as_str().unwrap();
        state
            .events
            .log()
            .unwrap()
            .append_event(&SessionEvent::Done {
                session_id: sid.to_string(),
            })
            .unwrap();

        let (status, fork) = post_json(&format!("{api}/sessions/{sid}/fork"), json!(null)).await;

        assert_eq!(status, StatusCode::OK);
        let fid = fork["id"].as_str().unwrap();
        assert_ne!(fid, sid);
        assert_eq!(fork["project_id"], project_id.as_str());
        assert_eq!(fork["title"], "New session (fork)");
        assert_eq!(fork["model"], sessions[0]["model"]);
        let (_, events) = get_json(&format!("{api}/sessions/{fid}/events")).await;
        // The original's start record and its `done`, re-addressed.
        assert_eq!(events.as_array().unwrap().len(), 2);
        assert!(events
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["session_id"] == fid));
        let (_, original) = get_json(&format!("{api}/sessions/{sid}/events")).await;
        assert_eq!(original[0]["session_id"], sid);
    }

    #[tokio::test]
    async fn a_running_session_is_neither_forked_nor_archived() {
        let (api, state) = start_with(Arc::new(HangModel::default())).await;
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let sid = sessions[0]["id"].as_str().unwrap();
        state.agent.send_message(sid, "work").unwrap();

        let (status, body) = post_json(&format!("{api}/sessions/{sid}/fork"), json!(null)).await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert!(body["error"].as_str().unwrap().contains("forking"));

        let (status, body) = send(
            reqwest::Method::PATCH,
            &format!("{api}/sessions/{sid}"),
            json!({ "archived": true }),
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert!(body["error"].as_str().unwrap().contains("archiving"));
    }

    #[tokio::test]
    async fn a_workspace_with_a_running_session_is_not_deleted() {
        let (api, state) = start_with(Arc::new(HangModel::default())).await;
        let (project_id, sessions) = project_with_sessions(&api, 1).await;
        state
            .agent
            .send_message(sessions[0]["id"].as_str().unwrap(), "work")
            .unwrap();
        let url = format!("{api}/projects/{project_id}");

        let (status, body) = send(reqwest::Method::DELETE, &url, json!({})).await;

        assert_eq!(status, StatusCode::CONFLICT);
        assert!(body["error"].as_str().unwrap().contains("running"));
        let (status, _) = get_json(&url).await;
        assert_eq!(status, StatusCode::OK);
    }

    async fn project_with_sessions(api: &str, count: usize) -> (String, Vec<Value>) {
        let repo = folders().join("repo");
        let (_, project) = post_json(&format!("{api}/projects"), json!({ "path": repo })).await;
        let id = project["id"].as_str().unwrap().to_string();
        let mut sessions = Vec::new();
        for _ in 0..count {
            let (_, s) = post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;
            sessions.push(s);
        }
        (id, sessions)
    }

    #[tokio::test]
    async fn a_project_lists_its_sessions_with_their_status() {
        let (api, state) = start_with(Arc::new(HangModel::default())).await;
        let (project_id, sessions) = project_with_sessions(&api, 2).await;
        let busy = sessions[0]["id"].as_str().unwrap();
        state.agent.send_message(busy, "work").unwrap();

        let (status, listed) = get_json(&format!("{api}/projects/{project_id}/sessions")).await;

        assert_eq!(status, StatusCode::OK);
        let listed = listed.as_array().unwrap();
        assert_eq!(listed.len(), 2);
        let running: Vec<_> = listed
            .iter()
            .map(|s| (s["id"].as_str().unwrap(), s["running"].as_bool().unwrap()))
            .collect();
        assert!(running.contains(&(busy, true)), "{running:?}");
        assert_eq!(running.iter().filter(|(_, r)| *r).count(), 1);
    }

    #[tokio::test]
    async fn sessions_of_an_unknown_project_are_not_found() {
        let (api, _) = start().await;
        let (status, _) = get_json(&format!("{api}/projects/nope/sessions")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    /// The session titles published for `id` so far.
    fn titles(
        rx: &mut tokio::sync::broadcast::Receiver<SessionEnvelope>,
        id: &str,
    ) -> Vec<(String, TitleSource)> {
        let mut out = Vec::new();
        while let Ok(envelope) = rx.try_recv() {
            if let SessionEvent::SessionTitle {
                session_id,
                title,
                source,
            } = envelope.event
            {
                if session_id == id {
                    out.push((title, source));
                }
            }
        }
        out
    }

    #[tokio::test]
    async fn a_new_session_logs_its_starting_settings() {
        let (api, state) = start().await;
        let mut rx = state.events.subscribe();
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();

        let started: Vec<_> = std::iter::from_fn(|| rx.try_recv().ok())
            .filter(|e| e.event.session_id() == id)
            .filter_map(|e| match e.event {
                SessionEvent::SessionStarted {
                    cwd,
                    provider,
                    model,
                    approval_mode,
                    sandbox,
                    ..
                } => Some((cwd, provider, model, approval_mode, sandbox.is_some())),
                _ => None,
            })
            .collect();

        assert_eq!(started.len(), 1, "{started:?}");
        let (cwd, provider, model, mode, has_sandbox) = &started[0];
        assert!(cwd.ends_with("repo"), "{cwd}");
        assert_eq!(provider, sessions[0]["model"]["provider"].as_str().unwrap());
        assert_eq!(model, sessions[0]["model"]["model"].as_str().unwrap());
        assert_eq!(
            serde_json::to_value(mode).unwrap(),
            sessions[0]["approval_mode"]
        );
        assert!(has_sandbox);
    }

    #[tokio::test]
    async fn naming_a_session_is_logged_by_its_first_message_then_by_a_rename() {
        let (api, state) = start_with(Arc::new(HangModel::default())).await;
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();
        let mut rx = state.events.subscribe();

        for text in ["Add dark mode", "and tests"] {
            crate::routes::handle_client_message(
                &state,
                &json!({ "type": "send_message", "session_id": id, "text": text }).to_string(),
            )
            .await;
        }
        let res = reqwest::Client::new()
            .patch(format!("{api}/sessions/{id}"))
            .json(&json!({ "title": "Dark theme" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        assert_eq!(
            titles(&mut rx, id),
            [
                ("Add dark mode".to_string(), TitleSource::FirstMessage),
                ("Dark theme".to_string(), TitleSource::User)
            ]
        );
    }

    #[tokio::test]
    async fn the_first_message_over_the_socket_names_the_session() {
        let (api, state) = start_with(Arc::new(HangModel::default())).await;
        let (project_id, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();

        crate::routes::handle_client_message(
            &state,
            &json!({ "type": "send_message", "session_id": id, "text": "Add dark mode" })
                .to_string(),
        )
        .await;

        let (_, listed) = get_json(&format!("{api}/projects/{project_id}/sessions")).await;
        assert_eq!(listed[0]["title"], "Add dark mode");
        assert_eq!(listed[0]["running"], true);
    }

    #[tokio::test]
    async fn a_session_backlog_is_served_in_order_after_a_sequence_number() {
        let (api, state) = start().await;
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();
        for chunk in ["a", "b", "c"] {
            state.events.publish(SessionEvent::Output {
                session_id: id.into(),
                chunk: chunk.into(),
            });
        }

        let (status, all) = get_json(&format!("{api}/sessions/{id}/events")).await;
        assert_eq!(status, StatusCode::OK);
        // The session's start record, then the three chunks.
        assert_eq!(all.as_array().unwrap().len(), 4);
        assert_eq!(all[0]["type"], "session_started");
        assert_eq!(
            without_ts(&all[1]),
            json!({ "seq": 2, "type": "output", "session_id": id, "chunk": "a" })
        );

        let (_, newer) = get_json(&format!("{api}/sessions/{id}/events?after=3")).await;
        assert_eq!(newer.as_array().unwrap().len(), 1);
        assert_eq!(
            without_ts(&newer[0]),
            json!({ "seq": 4, "type": "output", "session_id": id, "chunk": "c" })
        );
    }

    /// An event as served, after checking its timestamp is set.
    fn without_ts(event: &Value) -> Value {
        let mut event = event.clone();
        let ts = event.as_object_mut().unwrap().remove("ts");
        assert!(ts.and_then(|ts| ts.as_u64()).is_some_and(|ts| ts > 0));
        event
    }

    #[tokio::test]
    async fn a_long_session_opens_at_its_tail_and_pages_back() {
        let (api, state) = start().await;
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();
        for i in 0..5 {
            state.events.publish(SessionEvent::Output {
                session_id: id.into(),
                chunk: i.to_string(),
            });
        }
        let seqs = |events: &Value| -> Vec<u64> {
            events
                .as_array()
                .unwrap()
                .iter()
                .map(|e| e["seq"].as_u64().unwrap())
                .collect()
        };

        // Seq 1 is the session's start record; the chunks are 2 to 6.
        let (status, tail) = get_json(&format!("{api}/sessions/{id}/events?limit=2")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(seqs(&tail), [5, 6]);
        let (_, older) = get_json(&format!("{api}/sessions/{id}/events?before=5&limit=2")).await;
        assert_eq!(seqs(&older), [3, 4]);
        let (_, oldest) = get_json(&format!("{api}/sessions/{id}/events?before=2&limit=2")).await;
        assert_eq!(seqs(&oldest), [1]);
    }

    #[tokio::test]
    async fn changes_list_each_changed_file_as_it_now_stands() {
        let (api, state) = start().await;
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();
        let changed = |path: &str, diff: &str| SessionEvent::FileChanged {
            session_id: id.into(),
            path: path.into(),
            diff: diff.into(),
            additions: 1,
            deletions: 0,
        };
        state.events.publish(changed("old.txt", "+gone"));
        state.events.publish(SessionEvent::ChangesReverted {
            session_id: id.into(),
            paths: vec!["old.txt".into()],
        });
        state.events.publish(changed("a.txt", "+one"));
        state.events.publish(changed("b.txt", "+b"));
        state.events.publish(changed("a.txt", "+two"));
        // An edit back to the original leaves nothing to review.
        state.events.publish(changed("b.txt", ""));

        let (status, files) = get_json(&format!("{api}/sessions/{id}/changes")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            files,
            json!([{ "path": "a.txt", "diff": "+two", "additions": 1, "deletions": 0 }])
        );
        let res = reqwest::get(format!("{api}/sessions/nope/changes"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn stats_total_the_whole_log() {
        let (api, state) = start().await;
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();
        state.events.publish(SessionEvent::TurnStarted {
            session_id: id.into(),
            turn: 1,
        });
        state.events.publish(SessionEvent::StepEnded {
            session_id: id.into(),
            turn: 1,
            step: 1,
            usage: Some(api_types::Usage {
                input: 10,
                output: 20,
                cache_read: 30,
                cache_write: 0,
            }),
            first_token_ms: Some(100),
            generation_ms: Some(400),
        });

        let (status, stats) = get_json(&format!("{api}/sessions/{id}/stats")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(stats["turns"], 1);
        assert_eq!(stats["steps"], 1);
        assert_eq!(stats["usage"]["cache_read"], 30);
        assert_eq!(stats["decode_tokens"], 20);
        assert_eq!(stats["last_context_tokens"], 40);
        let res = reqwest::get(format!("{api}/sessions/nope/stats"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn bad_paging_requests_are_refused() {
        let (api, _) = start().await;
        let (_, sessions) = project_with_sessions(&api, 1).await;
        let id = sessions[0]["id"].as_str().unwrap();

        for query in [
            "limit=0",
            "limit=501",
            "after=1&before=3",
            "after=1&limit=2",
            "limit=x",
        ] {
            let res = reqwest::get(format!("{api}/sessions/{id}/events?{query}"))
                .await
                .unwrap();
            assert_eq!(res.status(), StatusCode::BAD_REQUEST, "{query}");
        }
    }

    #[tokio::test]
    async fn an_unknown_session_has_no_backlog() {
        let (api, _) = start().await;
        let (status, body) = get_json(&format!("{api}/sessions/nope/events")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body, json!({ "error": "session not found" }));
    }
}
