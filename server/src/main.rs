use axum::Router;
use clap::Parser;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

#[derive(Parser, Debug)]
#[command(name = "forge-server", about = "Ingenious Forge local server")]
struct Args {
    /// Port to listen on
    #[arg(long, default_value_t = 3000)]
    port: u16,

    /// Directory holding the built web SPA (index.html and assets)
    #[arg(long, default_value = "web/dist")]
    static_dir: PathBuf,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let args = Args::parse();
    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));

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
    let serve_dir = ServeDir::new(&args.static_dir).fallback(ServeFile::new(&index_html));
    let app = Router::new().fallback_service(serve_dir);

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
}
