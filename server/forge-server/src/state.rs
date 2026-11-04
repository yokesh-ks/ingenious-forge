use agent::Agent;
use services::EventService;
use sqlx::SqlitePool;

pub struct AppState {
    pub db: SqlitePool,
    pub events: EventService,
    pub agent: Agent,
    pub terminals: services::terminal::Terminals,
    pub settings: crate::settings::Settings,
}
