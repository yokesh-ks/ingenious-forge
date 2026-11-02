use services::EventService;
use sqlx::SqlitePool;

pub struct AppState {
    pub db: SqlitePool,
    pub events: EventService,
}
