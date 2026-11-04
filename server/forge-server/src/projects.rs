//! HTTP API for projects, their sessions and the folder picker.

use std::{path::PathBuf, sync::Arc};

use agent::tools::ToolBox;
use api_types::{
    ApiError, CommitMessageDraft, CommitRequest, CommitResult, CreateBranchRequest,
    CreateSessionRequest, DirListing, FileContent, FileList, GitStatus, ModelCatalog,
    OpenProjectRequest, Project, PushResult, Session, SessionEnvelope, SessionEvent,
    SetApprovalModeRequest,
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
        .route("/projects/{id}", get(get_project))
        .route("/projects/{id}/files", get(project_files))
        .route("/projects/{id}/file", get(project_file))
        .route("/projects/{id}/git/status", get(git_status))
        .route("/projects/{id}/git/branch", post(create_branch))
        .route("/projects/{id}/git/commit", post(commit))
        .route("/projects/{id}/git/push", post(push))
        .route("/sessions/{id}/commit-message", post(draft_commit_message))
        .route(
            "/projects/{id}/terminal",
            get(crate::terminal::terminal_socket),
        )
        .route(
            "/projects/{id}/sessions",
            get(list_sessions).post(create_session),
        )
        .route("/sessions/{id}/events", get(session_events))
        .route("/sessions/{id}/approval-mode", put(set_approval_mode))
        .route("/fs/dirs", get(list_dirs))
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
            ProjectError::Folder(_) => StatusCode::BAD_REQUEST,
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
    in_project(&state, &id, git::push).await.map(Json)
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
        if state.agent.providers().resolve(&(&model).into()).is_ok() {
            catalog.default = Some(model);
        }
    }
    catalog
}

/// Creates a session with the chosen model, or the catalog default.
async fn create_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    body: Option<Json<CreateSessionRequest>>,
) -> ApiResult<Session> {
    let body = body.map(|Json(body)| body).unwrap_or_default();
    let defaults = crate::settings::defaults(&state).await;
    let approval_mode = body.approval_mode.unwrap_or(defaults.approval_mode);
    let choice = match body.model {
        Some(model) => Some(model),
        None => catalog(&state).await.default,
    };
    // Check the choice before anything is stored.
    if let Some(choice) = &choice {
        if let Err(err) = state.agent.providers().resolve(&choice.into()) {
            return Err(ApiFailure(StatusCode::BAD_REQUEST, err.to_string()));
        }
    }
    let (mut session, folder) = projects::create_session(&state.db, &id, choice.as_ref()).await?;
    if approval_mode != session.approval_mode {
        session = projects::set_approval_mode(&state.db, &session.id, approval_mode).await?;
    }
    let tools = ToolBox::new(folder);
    match &choice {
        Some(choice) => state
            .agent
            .open_session_with(&session.id, tools, &choice.into())
            .map_err(|err| ApiFailure(StatusCode::BAD_REQUEST, err.to_string()))?,
        None => state.agent.open_session(&session.id, tools),
    }
    state
        .agent
        .set_approval_mode(&session.id, session.approval_mode);
    Ok(Json(session))
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
}

/// The logged events of a session after `?after=` (default: all), so a
/// browser can catch up after connecting or reconnecting.
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
    // Opening restores the session, closing a turn the server cut off.
    crate::routes::ensure_open(&state, &id).await;
    let Some(log) = state.events.log().cloned() else {
        return Ok(Json(Vec::new()));
    };
    let after = query.after.unwrap_or(0);
    let events = tokio::task::spawn_blocking(move || log.events_after(&id, after))
        .await
        .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(events))
}

#[derive(Deserialize)]
struct DirQuery {
    path: Option<String>,
}

async fn list_dirs(Query(query): Query<DirQuery>) -> ApiResult<DirListing> {
    let path = query
        .path
        .map(PathBuf::from)
        .or_else(folders::home_dir)
        .unwrap_or_else(|| PathBuf::from("/"));
    let listing = tokio::task::spawn_blocking(move || {
        folders::list_dirs(&path).map_err(|e| format!("cannot list {}: {e}", path.display()))
    })
    .await
    .map_err(|e| ApiFailure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| ApiFailure(StatusCode::BAD_REQUEST, e))?;
    Ok(Json(listing))
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
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
                    { "id": "fast", "name": "FAST" },
                    { "id": "smart", "name": "SMART" }
                ]}],
                "efforts": ["low", "medium", "high", "xhigh", "max"],
                "default": { "provider": "stub", "model": "fast", "effort": "high" }
            })
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

    #[tokio::test]
    async fn a_session_without_a_choice_gets_the_default_model() {
        let (api, _) = start_with_models().await;
        let id = new_project(&api).await;

        let (_, session) = post_json(&format!("{api}/projects/{id}/sessions"), json!({})).await;

        assert_eq!(
            session["model"],
            json!({ "provider": "stub", "model": "fast", "effort": "high" })
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
        let event = tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .event;
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
    async fn the_folder_picker_lists_sub_folders_and_marks_repositories() {
        let (api, _) = start().await;
        let dir = folders();

        let url = reqwest::Url::parse_with_params(
            &format!("{api}/fs/dirs"),
            &[("path", dir.to_str().unwrap())],
        )
        .unwrap();
        let (status, listing) = get_json(url.as_str()).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(listing["path"], dir.to_string_lossy().as_ref());
        assert_eq!(
            listing["entries"],
            json!([
                { "name": "plain", "path": dir.join("plain"), "is_git_repo": false },
                { "name": "repo", "path": dir.join("repo"), "is_git_repo": true },
            ])
        );
    }

    #[tokio::test]
    async fn the_folder_picker_starts_at_home_and_rejects_missing_folders() {
        let (api, _) = start().await;
        let (status, listing) = get_json(&format!("{api}/fs/dirs")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(listing["path"].as_str().is_some_and(|p| !p.is_empty()));

        let missing = folders().join("missing");
        let url = reqwest::Url::parse_with_params(
            &format!("{api}/fs/dirs"),
            &[("path", missing.to_str().unwrap())],
        )
        .unwrap();
        let (status, body) = get_json(url.as_str()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("cannot list"));
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
        assert_eq!(all.as_array().unwrap().len(), 3);
        assert_eq!(
            all[0],
            json!({ "seq": 1, "type": "output", "session_id": id, "chunk": "a" })
        );

        let (_, newer) = get_json(&format!("{api}/sessions/{id}/events?after=2")).await;
        assert_eq!(
            newer,
            json!([{ "seq": 3, "type": "output", "session_id": id, "chunk": "c" }])
        );
    }

    #[tokio::test]
    async fn an_unknown_session_has_no_backlog() {
        let (api, _) = start().await;
        let (status, body) = get_json(&format!("{api}/sessions/nope/events")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body, json!({ "error": "session not found" }));
    }
}
