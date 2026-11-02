use db::{ProjectRow, SessionRow};

async fn pool() -> sqlx::SqlitePool {
    db::connect(":memory:").await.unwrap()
}

#[tokio::test]
async fn opening_a_project_creates_it_once_and_bumps_last_opened() {
    let pool = pool().await;

    let first = db::upsert_project(&pool, "/code/forge", "forge", 100)
        .await
        .unwrap();
    let again = db::upsert_project(&pool, "/code/forge", "forge", 200)
        .await
        .unwrap();

    assert_eq!(first.id, again.id);
    assert_eq!(again.last_opened_at, 200);
    assert_eq!(first.id.len(), 32);
    assert_eq!(db::recent_projects(&pool, 10).await.unwrap(), vec![again]);
}

#[tokio::test]
async fn recent_projects_are_newest_first_and_limited() {
    let pool = pool().await;
    db::upsert_project(&pool, "/a", "a", 1).await.unwrap();
    db::upsert_project(&pool, "/b", "b", 3).await.unwrap();
    db::upsert_project(&pool, "/c", "c", 2).await.unwrap();

    let names: Vec<_> = db::recent_projects(&pool, 2)
        .await
        .unwrap()
        .into_iter()
        .map(|p: ProjectRow| p.name)
        .collect();
    assert_eq!(names, ["b", "c"]);
}

#[tokio::test]
async fn get_project_returns_none_for_unknown_ids() {
    let pool = pool().await;
    let p = db::upsert_project(&pool, "/a", "a", 1).await.unwrap();
    assert_eq!(db::get_project(&pool, &p.id).await.unwrap(), Some(p));
    assert_eq!(db::get_project(&pool, "nope").await.unwrap(), None);
}

#[tokio::test]
async fn sessions_are_created_in_a_project_and_found_by_id() {
    let pool = pool().await;
    let p = db::upsert_project(&pool, "/a", "a", 1).await.unwrap();

    let s = db::create_session(&pool, &p.id, "New session", 5)
        .await
        .unwrap();

    assert_eq!(
        s,
        SessionRow {
            id: s.id.clone(),
            project_id: p.id.clone(),
            title: "New session".into(),
            created_at: 5,
            updated_at: 5,
        }
    );
    assert_eq!(db::get_session(&pool, &s.id).await.unwrap(), Some(s));
    assert_eq!(db::get_session(&pool, "nope").await.unwrap(), None);
}

#[tokio::test]
async fn a_session_needs_an_existing_project() {
    let pool = pool().await;
    assert!(db::create_session(&pool, "missing", "t", 1).await.is_err());
}
