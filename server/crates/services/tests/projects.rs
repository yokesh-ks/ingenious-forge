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
        projects::create_session(&pool, "nope").await,
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

    let (session, folder) = projects::create_session(&pool, &project.id).await.unwrap();

    assert_eq!(session.project_id, project.id);
    assert_eq!(session.title, "New session");
    assert_eq!(folder, path);
    assert_eq!(
        projects::session_folder(&pool, &session.id).await.unwrap(),
        Some(path)
    );
    assert_eq!(projects::session_folder(&pool, "nope").await.unwrap(), None);
}
