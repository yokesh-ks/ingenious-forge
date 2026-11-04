# 0008. Encrypt stored secrets with AES-256-GCM and a local key file

- **Status:** Proposed
- **Date:** 2026-11-04
- **PRD:** §6.2 Settings, §7 Security, §8 Architecture

## Context

Issue #107 adds model provider API keys to Settings: they must be stored
encrypted on the local server, the browser must never receive the raw
key, and sessions must be able to use it, including after a restart.
The GitHub connection (#109) needs the same for its token. Until now the
only key came from the `ANTHROPIC_API_KEY` environment variable. Forge
runs as one local binary with SQLite (§8) and no extra services.
Principle VIII asks that each new dependency records the simpler option.

## Decision

- Secrets (provider API keys, the GitHub token) are encrypted with
  AES-256-GCM using the `aes-gcm` crate, each with a fresh random nonce,
  and stored in a `secrets` table in the SQLite database (name, nonce,
  ciphertext).
- The 256-bit key is generated once from the OS random source and kept in
  `secret.key` beside the database, readable only by the user (mode
  0600). It is never stored in the database.
- The API reports only whether a secret is set and its last four
  characters; no endpoint returns a stored secret.
- A key saved in Settings takes precedence over `ANTHROPIC_API_KEY`, and
  takes effect for sessions opened afterwards.

## Alternatives considered

### The OS keychain (macOS Keychain, Secret Service, Windows Credential Manager)

- Pros: the key never touches Forge's files; the OS guards it.
- Cons: a platform-specific crate per OS; Linux needs a running Secret
  Service, which servers and minimal desktops often lack; prompts can
  appear in a headless `npx` start.
- Rejected because: it fails on common Linux setups; it can be added
  later as a key source without changing the stored format.

### Plaintext in a file with mode 0600

- Pros: no dependency.
- Cons: the raw key sits in a file and in every backup or copy of it.
- Rejected because: #107 requires encryption at rest.

### Encrypting with a key derived from a user passphrase

- Pros: the stored data alone cannot be decrypted.
- Cons: the user must enter a passphrase at every server start, which
  breaks the one-command `npx` start (§8).
- Rejected because: the start-up friction outweighs the gain for a local,
  single-user tool.

## Consequences

- Good: the database can be copied or shared for debugging without
  exposing keys; keys survive restarts; the browser only sees a hint.
- Bad: anyone who can read both `secret.key` and the database as the user
  can decrypt the secrets, so this protects against leaks of the database
  file, not against malware running as the user. Losing `secret.key`
  loses the stored secrets (they must be entered again). One new
  dependency (`aes-gcm`).
- Follow-up: #109 stores the GitHub token the same way; an OS keychain
  key source can be a later story.
