# 0003. Split the Rust server into a Cargo workspace by PRD module

- **Status:** Proposed
- **Date:** 2026-11-02
- **PRD:** §8 Architecture (Backend: Rust, with modules `server`, `agent`,
  `services`, `git`, `db`, `api-types`, `utils`)

## Context

`server/` is currently a single crate (`ingenious-forge-server`) with all
logic in one `main.rs` that only serves static files. PRD §8 already names
the module split (`server`, `agent`, `services`, `git`, `db`, `api-types`,
`utils`), so the split itself is approved scope; this ADR records the
crate-level implementation choice, in particular persistence.

PRD §8 names `db` backed by SQLite. The maintainer approved splitting the
single crate into a Cargo workspace and using `sqlx` for SQLite access in
this conversation.

## Decision

- Turn `server/` into a Cargo workspace: a thin `forge-server` binary crate
  for wiring (CLI args, router assembly, state), and one library crate per
  PRD module under `server/crates/`: `api-types`, `db`, `services`,
  `agent`, `git`, `utils`.
- `db` uses `sqlx` (`sqlite`, `runtime-tokio`, `migrate` features) with
  versioned SQL migrations in `crates/db/migrations/`.
- Shared dependency versions are pinned once in `[workspace.dependencies]`.
- Library crates return typed errors via `thiserror`; `anyhow` is used only
  at the `forge-server` binary boundary.

## Alternatives considered

### Keep a single crate, organized into Rust modules instead of workspace members

- Pros: simpler build graph; no inter-crate dependency bookkeeping.
- Cons: `agent`, `git` and `db` cannot be unit-tested or compiled in
  isolation; one crate's dependency bloat (e.g. `sqlx`) affects build times
  for code that does not need it.
- Rejected because: PRD §8 already names these as separate modules, and a
  workspace makes that boundary enforced by the compiler, not convention.

### `rusqlite` instead of `sqlx` for the `db` crate

- Pros: lighter dependency, synchronous, no async runtime coupling.
- Cons: hand-rolled migrations; mixing sync SQLite calls into an async
  (tokio) server needs manual `spawn_blocking` wrapping to avoid blocking
  the executor.
- Rejected because: `sqlx::migrate!` gives versioned migrations for free
  and its async pool integrates directly with the existing `tokio` runtime
  already required by `axum`.

## Consequences

- Good: each backend module is independently buildable and testable;
  migrations are versioned and reproducible.
- Bad: `sqlx`, `thiserror` and workspace-member bookkeeping are new
  dependencies/structure; contributors must know which crate owns what.
- Follow-up: `agent`, `git` and `utils` crates start as stubs until their
  PRD P0 features are built; do not add their eventual dependencies (model SDKs,
  `git2`) before a feature needs them.
