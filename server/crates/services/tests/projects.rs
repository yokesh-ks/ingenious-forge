use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

use services::{
    folders::FolderError,
    projects::{self, ProjectError},
};

fn repo(name: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir()
        .join(format!(
            "forge-projects-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ))
        .join(name);
    fs::create_dir_all(dir.join(".git")).unwrap();
    dir.canonicalize().unwrap()
}

async fn pool() -> sqlx::SqlitePool {
    db::connect(":memory:").await.unwrap()
}

#[tokio::test]
async fn opening_a_repository_records_it_as_a_recent_project() {
    let pool = pool().await;
    let path = repo("forge");

    let project = projects::open_project(&pool, path.to_str().unwrap())
        .await
        .unwrap();

    assert_eq!(project.name, "forge");
    assert_eq!(project.path, path.to_string_lossy());
    assert!(project.last_opened_at > 1_600_000_000_000);
    assert_eq!(
        projects::recent_projects(&pool).await.unwrap(),
        vec![project.clone()]
    );
    assert_eq!(
        projects::get_project(&pool, &project.id).await.unwrap(),
        project
    );
}

#[tokio::test]
async fn a_folder_that_is_not_a_repository_is_refused() {
    let pool = pool().await;
    let plain = repo("x").parent().unwrap().join("plain");
    fs::create_dir_all(&plain).unwrap();

    let err = projects::open_project(&pool, plain.to_str().unwrap())
        .await
        .unwrap_err();

    assert!(matches!(
        err,
        ProjectError::Folder(FolderError::NotAGitRepo)
    ));
    assert!(projects::recent_projects(&pool).await.unwrap().is_empty());
}

#[tokio::test]
async fn unknown_projects_are_not_found() {
    let pool = pool().await;
    assert!(matches!(
        projects::get_project(&pool, "nope").await,
        Err(ProjectError::NotFound)
    ));
    assert!(matches!(
        projects::create_session(&pool, "nope", None).await,
        Err(ProjectError::NotFound)
    ));
}

#[tokio::test]
async fn a_new_session_belongs_to_its_project_folder() {
    let pool = pool().await;
    let path = repo("app");
    let project = projects::open_project(&pool, path.to_str().unwrap())
        .await
        .unwrap();

    let (session, folder) = projects::create_session(&pool, &project.id, None)
        .await
        .unwrap();

    assert_eq!(session.project_id, project.id);
    assert_eq!(session.title, "New session");
    assert_eq!(folder, path);
    assert_eq!(
        projects::session_folder(&pool, &session.id).await.unwrap(),
        Some(path)
    );
    assert_eq!(projects::session_folder(&pool, "nope").await.unwrap(), None);
}

#[tokio::test]
async fn the_first_message_names_the_session_and_every_message_bumps_activity() {
    let pool = pool().await;
    let project = projects::open_project(&pool, repo("named").to_str().unwrap())
        .await
        .unwrap();
    let (session, _) = projects::create_session(&pool, &project.id, None)
        .await
        .unwrap();

    let named = projects::record_message(&pool, &session.id, "  Fix the login bug\nwith details  ")
        .await
        .unwrap();
    let again = projects::record_message(&pool, &session.id, "and add a test")
        .await
        .unwrap();
    // Only the first message names the session.
    assert_eq!(named.as_deref(), Some("Fix the login bug"));
    assert_eq!(again, None);

    let listed = projects::list_sessions(&pool, &project.id).await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title, "Fix the login bug");
    assert!(listed[0].updated_at >= session.updated_at);
}

#[test]
fn long_titles_are_shortened() {
    let title = projects::title_from_message(&"word ".repeat(30));
    assert!(title.chars().count() <= 60, "{title}");
    assert!(title.starts_with("word word"));
    assert!(title.ends_with('…'));
    assert_eq!(projects::title_from_message("  short  "), "short");
}

#[tokio::test]
async fn listing_sessions_of_an_unknown_project_is_not_found() {
    let pool = pool().await;
    assert!(matches!(
        projects::list_sessions(&pool, "nope").await,
        Err(ProjectError::NotFound)
    ));
}

#[tokio::test]
async fn a_session_keeps_its_model_choice_and_old_sessions_have_none() {
    use api_types::{ReasoningEffort, SessionModel};
    let pool = pool().await;
    let path = repo("models");
    let project = projects::open_project(&pool, path.to_str().unwrap())
        .await
        .unwrap();
    let choice = SessionModel {
        provider: "anthropic".into(),
        model: "claude-haiku-5-5".into(),
        effort: ReasoningEffort::Low,
    };

    let (picked, _) = projects::create_session(&pool, &project.id, Some(&choice))
        .await
        .unwrap();
    let (plain, _) = projects::create_session(&pool, &project.id, None)
        .await
        .unwrap();

    assert_eq!(picked.model, Some(choice.clone()));
    assert_eq!(plain.model, None);
    assert_eq!(
        projects::session_settings(&pool, &picked.id).await.unwrap(),
        Some((path.clone(), Some(choice)))
    );
    assert_eq!(
        projects::session_settings(&pool, &plain.id).await.unwrap(),
        Some((path, None))
    );
    assert_eq!(
        projects::session_settings(&pool, "nope").await.unwrap(),
        None
    );
}

#[tokio::test]
async fn new_sessions_ask_for_approval_and_the_mode_can_change() {
    use api_types::ApprovalMode;
    let pool = pool().await;
    let project = projects::open_project(&pool, repo("modes").to_str().unwrap())
        .await
        .unwrap();
    let (session, _) = projects::create_session(&pool, &project.id, None)
        .await
        .unwrap();
    assert_eq!(session.approval_mode, ApprovalMode::Ask);

    let changed = projects::set_approval_mode(&pool, &session.id, ApprovalMode::FullAuto)
        .await
        .unwrap();
    assert_eq!(changed.approval_mode, ApprovalMode::FullAuto);
    let listed = projects::list_sessions(&pool, &project.id).await.unwrap();
    assert_eq!(listed[0].approval_mode, ApprovalMode::FullAuto);
    assert!(matches!(
        projects::set_approval_mode(&pool, "nope", ApprovalMode::Ask).await,
        Err(ProjectError::NotFound)
    ));
}
