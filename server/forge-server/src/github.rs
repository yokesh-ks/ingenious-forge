//! The GitHub connection (PRD §6.2 Settings, Git actions): a personal
//! access token, checked against the GitHub API, stored encrypted (ADR
//! 0008) and used by git push for github.com remotes.

use std::sync::Arc;

use api_types::{ConnectGitHubRequest, GitHubConnection};
use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde::Deserialize;

use crate::{projects::ApiFailure, state::AppState};

pub const DEFAULT_API: &str = "https://api.github.com";
const TOKEN: &str = "github-token";
const LOGIN: &str = "github-login";

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route(
        "/settings/github",
        get(connection).put(connect).delete(disconnect),
    )
}

/// The stored token, when GitHub is connected.
pub async fn token(state: &AppState) -> Option<String> {
    let store = state.settings.secrets.as_ref()?;
    store.get(TOKEN).await.unwrap_or_else(|err| {
        tracing::warn!(%err, "ignoring the stored GitHub token");
        None
    })
}

async fn current(state: &AppState) -> GitHubConnection {
    if token(state).await.is_none() {
        return GitHubConnection::default();
    }
    GitHubConnection {
        connected: true,
        login: db::get_setting(&state.db, LOGIN).await.ok().flatten(),
    }
}

async fn connection(State(state): State<Arc<AppState>>) -> Json<GitHubConnection> {
    Json(current(&state).await)
}

#[derive(Deserialize)]
struct User {
    login: String,
}

/// The login of the account `token` belongs to.
async fn login_for(api: &str, token: &str) -> Result<String, ApiFailure> {
    let res = reqwest::Client::new()
        .get(format!("{api}/user"))
        .bearer_auth(token)
        .header("user-agent", "ingenious-forge")
        .header("accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| {
            ApiFailure::new(StatusCode::BAD_GATEWAY, format!("cannot reach GitHub: {e}"))
        })?;
    match res.status() {
        status if status.is_success() => res.json::<User>().await.map(|u| u.login).map_err(|e| {
            ApiFailure::new(
                StatusCode::BAD_GATEWAY,
                format!("unexpected GitHub reply: {e}"),
            )
        }),
        StatusCode::UNAUTHORIZED => Err(ApiFailure::new(
            StatusCode::BAD_REQUEST,
            "GitHub did not accept this token",
        )),
        status => Err(ApiFailure::new(
            StatusCode::BAD_GATEWAY,
            format!("GitHub answered {status}"),
        )),
    }
}

/// Checks a personal access token with GitHub and stores it.
async fn connect(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ConnectGitHubRequest>,
) -> Result<Json<GitHubConnection>, ApiFailure> {
    let token = body.token.trim();
    if token.is_empty() {
        return Err(ApiFailure::new(
            StatusCode::BAD_REQUEST,
            "enter a GitHub token",
        ));
    }
    let store = state
        .settings
        .secrets
        .as_ref()
        .ok_or_else(|| ApiFailure::internal("secret storage is not available"))?;
    let api = state.settings.github_api.as_deref().unwrap_or(DEFAULT_API);
    let login = login_for(api, token).await?;
    store
        .set(TOKEN, token)
        .await
        .map_err(ApiFailure::internal)?;
    db::set_setting(&state.db, LOGIN, &login)
        .await
        .map_err(|e| ApiFailure::internal(e.to_string()))?;
    Ok(Json(GitHubConnection {
        connected: true,
        login: Some(login),
    }))
}

async fn disconnect(
    State(state): State<Arc<AppState>>,
) -> Result<Json<GitHubConnection>, ApiFailure> {
    if let Some(store) = &state.settings.secrets {
        store.remove(TOKEN).await.map_err(ApiFailure::internal)?;
    }
    Ok(Json(GitHubConnection::default()))
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use agent::Agent;
    use axum::http::HeaderMap;
    use serde_json::{json, Value};
    use services::{secrets::SecretStore, EventService};

    use super::*;
    use crate::settings::Settings;

    struct NoModel;
    impl agent::model::ModelClient for NoModel {
        fn stream(
            &self,
            _: agent::model::ModelRequest,
        ) -> tokio::sync::mpsc::Receiver<Result<agent::model::ModelEvent, agent::model::ModelError>>
        {
            tokio::sync::mpsc::channel(1).1
        }
    }

    /// A stand-in for the GitHub API that accepts one token.
    async fn fake_github(seen: Arc<Mutex<Vec<String>>>) -> String {
        let app = Router::new().route(
            "/user",
            get(move |headers: HeaderMap| {
                let seen = seen.clone();
                async move {
                    let auth = headers["authorization"].to_str().unwrap().to_string();
                    seen.lock().unwrap().push(auth.clone());
                    if auth == "Bearer ghp_good" {
                        (StatusCode::OK, Json(json!({ "login": "octo" })))
                    } else {
                        (
                            StatusCode::UNAUTHORIZED,
                            Json(json!({ "message": "Bad credentials" })),
                        )
                    }
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}")
    }

    async fn start(github_api: String) -> (String, Arc<AppState>) {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "forge-github-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = db::connect(dir.join("forge.db").to_str().unwrap())
            .await
            .unwrap();
        let events = EventService::new();
        let state = Arc::new(AppState {
            db: pool.clone(),
            agent: Agent::new(Arc::new(NoModel), events.clone()),
            events,
            terminals: Default::default(),
            settings: Settings {
                secrets: Some(SecretStore::open(pool, &dir.join("secret.key")).unwrap()),
                github_api: Some(github_api),
                ..Settings::default()
            },
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .nest("/api", router())
            .with_state(state.clone());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}/api/settings/github"), state)
    }

    async fn call(method: reqwest::Method, url: &str, body: Option<Value>) -> (u16, String) {
        let mut req = reqwest::Client::new().request(method, url);
        if let Some(body) = body {
            req = req.json(&body);
        }
        let res = req.send().await.unwrap();
        (res.status().as_u16(), res.text().await.unwrap())
    }

    #[tokio::test]
    async fn a_valid_token_connects_the_account_and_is_stored_for_push() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (url, state) = start(fake_github(seen.clone()).await).await;

        let (_, before) = call(reqwest::Method::GET, &url, None).await;
        assert_eq!(
            serde_json::from_str::<Value>(&before).unwrap(),
            json!({ "connected": false, "login": null })
        );

        let (status, body) = call(
            reqwest::Method::PUT,
            &url,
            Some(json!({ "token": " ghp_good " })),
        )
        .await;

        assert_eq!(status, 200);
        assert!(!body.contains("ghp_good"), "{body}");
        assert_eq!(
            serde_json::from_str::<Value>(&body).unwrap(),
            json!({ "connected": true, "login": "octo" })
        );
        assert_eq!(seen.lock().unwrap().as_slice(), ["Bearer ghp_good"]);
        assert_eq!(token(&state).await.as_deref(), Some("ghp_good"));
        let (_, after) = call(reqwest::Method::GET, &url, None).await;
        assert!(after.contains("octo"));
    }

    #[tokio::test]
    async fn a_rejected_token_is_not_stored() {
        let (url, state) = start(fake_github(Arc::default()).await).await;
        let (status, body) = call(
            reqwest::Method::PUT,
            &url,
            Some(json!({ "token": "ghp_bad" })),
        )
        .await;
        assert_eq!(status, 400);
        assert!(body.contains("did not accept"), "{body}");
        assert_eq!(token(&state).await, None);

        let (status, _) = call(reqwest::Method::PUT, &url, Some(json!({ "token": "  " }))).await;
        assert_eq!(status, 400);
    }

    #[tokio::test]
    async fn disconnecting_forgets_the_token() {
        let (url, state) = start(fake_github(Arc::default()).await).await;
        call(
            reqwest::Method::PUT,
            &url,
            Some(json!({ "token": "ghp_good" })),
        )
        .await;

        let (status, body) = call(reqwest::Method::DELETE, &url, None).await;

        assert_eq!(status, 200);
        assert!(body.contains("\"connected\":false"));
        assert_eq!(token(&state).await, None);
    }

    #[tokio::test]
    async fn an_unreachable_github_is_reported() {
        let (url, _) = start("http://127.0.0.1:1".into()).await;
        let (status, body) = call(
            reqwest::Method::PUT,
            &url,
            Some(json!({ "token": "ghp_good" })),
        )
        .await;
        assert_eq!(status, 502);
        assert!(body.contains("cannot reach GitHub"), "{body}");
    }
}
