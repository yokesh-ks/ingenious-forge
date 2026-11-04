mod github;
mod projects;
mod routes;
mod settings;
mod state;
mod terminal;

use std::{net::SocketAddr, path::PathBuf, sync::Arc};

use agent::{anthropic::AnthropicProvider, providers::Providers, Agent};
use clap::Parser;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

use state::AppState;

#[derive(Parser, Debug)]
#[command(name = "forge-server", about = "Ingenious Forge local server")]
struct Args {
    /// Port to listen on
    #[arg(long, default_value_t = 3000)]
    port: u16,

    /// Directory holding the built web SPA (index.html and assets)
    #[arg(long, default_value = "apps/web/dist")]
    static_dir: PathBuf,

    /// A git repository to add to the recent projects at startup
    #[arg(long)]
    project_dir: Option<PathBuf>,

    /// Path to the SQLite database file
    #[arg(long, default_value = "forge.db")]
    db_path: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    let index_html = args.static_dir.join("index.html");
    if !index_html.is_file() {
        eprintln!(
            "error: no index.html found at {} (--static-dir {})",
            index_html.display(),
            args.static_dir.display()
        );
        eprintln!("Pass --static-dir pointing at the built web SPA, or run from the directory that contains it.");
        std::process::exit(1);
    }

    let pool = db::connect(&args.db_path).await?;
    if let Some(dir) = &args.project_dir {
        let path = dir.canonicalize().unwrap_or_else(|_| dir.clone());
        match services::projects::open_project(&pool, &path.to_string_lossy()).await {
            Ok(project) => info!(project = %project.path, "added project"),
            Err(err) => {
                eprintln!("error: --project-dir {}: {err}", dir.display());
                std::process::exit(1);
            }
        }
    }
    // Session logs live beside the database (ADR 0005).
    let data_dir = std::path::Path::new(&args.db_path)
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();
    let log_dir = data_dir.join("sessions");
    let log = services::log::SessionLog::open(&log_dir)?;
    let events = services::EventService::with_log(Arc::new(log));
    // Provider keys move to Settings in a later story (PRD §6.2 Settings).
    // Each provider adapter is registered here; the first is the default.
    // A key saved in Settings wins over the environment (ADR 0008).
    let env_key = std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty());
    let anthropic = AnthropicProvider::new(env_key.clone());
    let secrets = services::secrets::SecretStore::open(pool.clone(), &data_dir.join("secret.key"))
        .map_err(anyhow::Error::msg)?;
    let mut keys = std::collections::BTreeMap::new();
    keys.insert(
        "anthropic".to_string(),
        settings::ProviderKey {
            name: "Anthropic".into(),
            handle: anthropic.key_handle(),
            env: env_key,
        },
    );
    let settings = settings::Settings {
        secrets: Some(secrets),
        providers: keys,
        github_api: None,
    };
    settings.load().await;
    let mut providers = Providers::new();
    providers.register(Arc::new(anthropic));
    let state = Arc::new(AppState {
        db: pool,
        agent: Agent::with_providers(providers, events.clone()),
        terminals: services::terminal::Terminals::default(),
        settings,
        events,
    });

    let serve_dir = ServeDir::new(&args.static_dir).fallback(ServeFile::new(&index_html));
    let app = routes::router()
        .fallback_service(serve_dir)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("error: failed to bind {addr}: {e}");
            std::process::exit(1);
        }
    };

    info!("forge server listening on http://{addr}");

    let serve = axum::serve(listener, app).with_graceful_shutdown(async {
        tokio::signal::ctrl_c().await.ok();
    });

    if let Err(e) = serve.await {
        eprintln!("error: server error: {e}");
        std::process::exit(1);
    }

    Ok(())
}
