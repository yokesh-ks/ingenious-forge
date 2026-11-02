use agent::Agent;
use services::EventService;
use sqlx::SqlitePool;

pub struct AppState {
    #[allow(dead_code)]
    pub db: SqlitePool,
    pub events: EventService,
    pub agent: Agent,
}
