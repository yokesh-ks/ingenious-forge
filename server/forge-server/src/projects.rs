//! HTTP API for projects, their sessions and the folder picker.

use std::{path::PathBuf, sync::Arc};

use agent::tools::ToolBox;
use api_types::{
    ApiError, CreateSessionRequest, DirListing, ModelCatalog, OpenProjectRequest, Project, Session,
    SessionEnvelope, SessionEvent, SetApprovalModeRequest,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, put},
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

async fn model_catalog(State(state): State<Arc<AppState>>) -> Json<ModelCatalog> {
    Json(state.agent.providers().catalog())
}

/// Creates a session with the chosen model, or the catalog default.
async fn create_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    body: Option<Json<CreateSessionRequest>>,
) -> ApiResult<Session> {
    let choice = body
        .and_then(|Json(body)| body.model)
        .or_else(|| state.agent.providers().catalog().default);
    // Check the choice before anything is stored.
    if let Some(choice) = &choice {
        if let Err(err) = state.agent.providers().resolve(&choice.into()) {
            return Err(ApiFailure(StatusCode::BAD_REQUEST, err.to_string()));
        }
    }
    let (session, folder) = projects::create_session(&state.db, &id, choice.as_ref()).await?;
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
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .nest("/api", router())
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
        };
        crate::routes::ensure_open(&restarted, &sid).await;
        assert_eq!(
            restarted.agent.approval_mode(&sid),
            Some(api_types::ApprovalMode::FullAuto)
        );
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
