//! Secrets stored encrypted on the local server (PRD §6.2 Settings, §7
//! Security; ADR 0008): AES-256-GCM, a fresh nonce per secret, the key in
//! a private file beside the database.

use std::{io::Write, os::unix::fs::OpenOptionsExt, path::Path, sync::Arc};

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sqlx::SqlitePool;

#[derive(Clone)]
pub struct SecretStore {
    pool: SqlitePool,
    cipher: Arc<Aes256Gcm>,
}

impl SecretStore {
    /// Opens the store, creating the key file (mode 0600) the first time.
    pub fn open(pool: SqlitePool, key_file: &Path) -> Result<Self, String> {
        let key = match std::fs::read(key_file) {
            Ok(bytes) if bytes.len() == 32 => bytes,
            Ok(_) => return Err(format!("{} is not a valid key file", key_file.display())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let key = Aes256Gcm::generate_key(OsRng).to_vec();
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .mode(0o600)
                    .open(key_file)
                    .map_err(|e| format!("cannot create {}: {e}", key_file.display()))?;
                file.write_all(&key)
                    .map_err(|e| format!("cannot write {}: {e}", key_file.display()))?;
                key
            }
            Err(e) => return Err(format!("cannot read {}: {e}", key_file.display())),
        };
        Ok(Self {
            pool,
            cipher: Arc::new(Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key))),
        })
    }

    pub async fn set(&self, name: &str, value: &str) -> Result<(), String> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = self
            .cipher
            .encrypt(&nonce, value.as_bytes())
            .map_err(|_| "cannot encrypt the secret".to_string())?;
        sqlx::query(
            "INSERT INTO secrets (name, nonce, ciphertext) VALUES (?1, ?2, ?3)
             ON CONFLICT(name) DO UPDATE SET nonce = ?2, ciphertext = ?3",
        )
        .bind(name)
        .bind(nonce.to_vec())
        .bind(ciphertext)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// The secret `name`, `None` when unset. An error when it cannot be
    /// decrypted, such as after the key file changed.
    pub async fn get(&self, name: &str) -> Result<Option<String>, String> {
        let row: Option<(Vec<u8>, Vec<u8>)> =
            sqlx::query_as("SELECT nonce, ciphertext FROM secrets WHERE name = ?1")
                .bind(name)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
        let Some((nonce, ciphertext)) = row else {
            return Ok(None);
        };
        if nonce.len() != 12 {
            return Err(format!("the stored {name} secret is damaged"));
        }
        let plain = self
            .cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| format!("cannot decrypt the stored {name} secret; enter it again"))?;
        String::from_utf8(plain)
            .map(Some)
            .map_err(|_| format!("the stored {name} secret is damaged"))
    }

    /// Forgets `name`; false when it was not set.
    pub async fn remove(&self, name: &str) -> Result<bool, String> {
        let done = sqlx::query("DELETE FROM secrets WHERE name = ?1")
            .bind(name)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(done.rows_affected() > 0)
    }
}

/// What the browser may see of a secret: its last four characters.
pub fn hint(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    if chars.len() <= 4 {
        return "…".into();
    }
    format!("…{}", chars[chars.len() - 4..].iter().collect::<String>())
}
