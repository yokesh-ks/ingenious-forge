#!/bin/sh
# Format-check, lint and test the Rust server workspace. The api-types
# tests compare the generated TypeScript in apps/web/src/api/types.ts with
# the Rust types, so a drift between backend and frontend fails here
# (PRD §6.2 Typed API). CI job: server.
#
# Usage: scripts/check-server.sh

set -e
cd "$(dirname "$0")/../server"
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
echo "server: ok"
