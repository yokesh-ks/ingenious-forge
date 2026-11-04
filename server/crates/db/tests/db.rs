use db::{ProjectRow, SessionModelRow, SessionRow};

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
            model: None,
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

#[tokio::test]
async fn sessions_list_newest_activity_first_within_a_project() {
    let pool = pool().await;
    let p = db::upsert_project(&pool, "/a", "a", 1).await.unwrap();
    let other = db::upsert_project(&pool, "/b", "b", 1).await.unwrap();
    let old = db::create_session(&pool, &p.id, "old", 1).await.unwrap();
    let new = db::create_session(&pool, &p.id, "new", 2).await.unwrap();
    db::create_session(&pool, &other.id, "elsewhere", 3)
        .await
        .unwrap();

    let titles = |rows: Vec<SessionRow>| rows.into_iter().map(|s| s.title).collect::<Vec<_>>();
    assert_eq!(
        titles(db::list_sessions(&pool, &p.id).await.unwrap()),
        ["new", "old"]
    );

    db::touch_session(&pool, &old.id, None, 9).await.unwrap();
    assert_eq!(
        titles(db::list_sessions(&pool, &p.id).await.unwrap()),
        ["old", "new"]
    );
    let _ = new;
}

#[tokio::test]
async fn touch_session_can_set_the_title() {
    let pool = pool().await;
    let p = db::upsert_project(&pool, "/a", "a", 1).await.unwrap();
    let s = db::create_session(&pool, &p.id, "New session", 1)
        .await
        .unwrap();

    db::touch_session(&pool, &s.id, Some("Fix the bug"), 5)
        .await
        .unwrap();

    let row = db::get_session(&pool, &s.id).await.unwrap().unwrap();
    assert_eq!((row.title.as_str(), row.updated_at), ("Fix the bug", 5));
}

#[tokio::test]
async fn a_session_keeps_the_model_it_was_created_with() {
    let pool = pool().await;
    let p = db::upsert_project(&pool, "/a", "a", 1).await.unwrap();
    let model = SessionModelRow {
        provider: "anthropic".into(),
        model: "claude-sonnet-5-5".into(),
        effort: "xhigh".into(),
    };

    let s = db::create_session_with(&pool, &p.id, "t", 1, Some(&model))
        .await
        .unwrap();

    assert_eq!(s.model.as_ref(), Some(&model));
    let found = db::get_session(&pool, &s.id).await.unwrap().unwrap();
    assert_eq!(found.model, Some(model.clone()));
    assert_eq!(
        db::list_sessions(&pool, &p.id).await.unwrap()[0].model,
        Some(model)
    );
}
