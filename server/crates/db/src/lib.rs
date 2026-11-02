use sqlx::SqlitePool;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("migration failed: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}

pub async fn connect(path: &str) -> Result<SqlitePool, DbError> {
    let pool = SqlitePool::connect(&format!("sqlite://{path}?mode=rwc")).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
