//! Secrets stored encrypted on the local server (PRD §6.2 Settings, §7
//! Security; ADR 0008).

use std::{os::unix::fs::PermissionsExt, path::PathBuf};

use services::secrets::SecretStore;

fn dir() -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "forge-secrets-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

async fn pool(dir: &std::path::Path) -> sqlx::SqlitePool {
    db::connect(dir.join("forge.db").to_str().unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn a_secret_round_trips_and_is_not_stored_in_plaintext() {
    let dir = dir();
    let pool = pool(&dir).await;
    let store = SecretStore::open(pool.clone(), &dir.join("secret.key")).unwrap();

    store.set("anthropic", "sk-ant-very-secret").await.unwrap();

    assert_eq!(
        store.get("anthropic").await.unwrap().as_deref(),
        Some("sk-ant-very-secret")
    );
    let (cipher,): (Vec<u8>,) =
        sqlx::query_as("SELECT ciphertext FROM secrets WHERE name = 'anthropic'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!String::from_utf8_lossy(&cipher).contains("very-secret"));
    let raw_db = std::fs::read(dir.join("forge.db")).unwrap();
    assert!(!String::from_utf8_lossy(&raw_db).contains("very-secret"));
}

#[tokio::test]
async fn the_key_file_is_private_and_reused_after_a_restart() {
    let dir = dir();
    let key = dir.join("secret.key");
    let store = SecretStore::open(pool(&dir).await, &key).unwrap();
    store.set("gh", "token-1").await.unwrap();
    let mode = std::fs::metadata(&key).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);

    let again = SecretStore::open(pool(&dir).await, &key).unwrap();
    assert_eq!(again.get("gh").await.unwrap().as_deref(), Some("token-1"));
}

#[tokio::test]
async fn another_key_cannot_read_the_secrets() {
    let dir = dir();
    let store = SecretStore::open(pool(&dir).await, &dir.join("a.key")).unwrap();
    store.set("x", "value").await.unwrap();

    let other = SecretStore::open(pool(&dir).await, &dir.join("b.key")).unwrap();
    assert!(other.get("x").await.is_err());
}

#[tokio::test]
async fn setting_again_replaces_and_removing_forgets() {
    let dir = dir();
    let store = SecretStore::open(pool(&dir).await, &dir.join("secret.key")).unwrap();
    store.set("x", "one").await.unwrap();
    store.set("x", "two").await.unwrap();
    assert_eq!(store.get("x").await.unwrap().as_deref(), Some("two"));

    assert!(store.remove("x").await.unwrap());
    assert_eq!(store.get("x").await.unwrap(), None);
    assert!(!store.remove("x").await.unwrap());
}

#[test]
fn hints_show_only_the_last_four_characters() {
    assert_eq!(services::secrets::hint("sk-ant-abcdef1234"), "…1234");
    assert_eq!(services::secrets::hint("abc"), "…");
}
