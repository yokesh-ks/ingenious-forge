use axum::{Router, response::Html, routing::get};
use clap::Parser;
use std::net::SocketAddr;
use tracing::info;

#[derive(Parser, Debug)]
#[command(name = "forge-server", about = "Ingenious Forge local server")]
struct Args {
    /// Port to listen on
    #[arg(long, default_value_t = 3000)]
    port: u16,
}

static HOME_HTML: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ingenious Forge</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f0f11;
      color: #e8e8ed;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      padding: 2rem;
    }
    h1 { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.02em; }
    h1 span { color: #7c6ef7; }
    p { color: #888; font-size: 1.125rem; max-width: 36rem; text-align: center; }
    .badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.75rem;
      border: 1px solid #333;
      border-radius: 9999px;
      color: #666;
    }
  </style>
</head>
<body>
  <span class="badge">local server running</span>
  <h1>Ingenious <span>Forge</span></h1>
  <p>The web-native coding harness. Your agent, your browser, your machine.</p>
</body>
</html>
"#;

async fn home() -> Html<&'static str> {
    Html(HOME_HTML)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let args = Args::parse();
    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));

    let app = Router::new().route("/", get(home));

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
