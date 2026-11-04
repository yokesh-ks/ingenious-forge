-- Secrets such as provider API keys, encrypted with AES-256-GCM using the
-- key in secret.key beside the database (ADR 0008).
CREATE TABLE secrets (
    name TEXT PRIMARY KEY,
    nonce BLOB NOT NULL,
    ciphertext BLOB NOT NULL
);
