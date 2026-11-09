#!/usr/bin/env bash
# Starts the Forge backend (Rust) and frontend (Vite) dev servers, waits for
# both to come up, then opens the frontend in the default browser.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

BACKEND_PORT=3000
FRONTEND_PORT=5173
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID=""
FRONTEND_PID=""

info()  { printf '\033[1;34m[dev-start]\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m[dev-start]\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m[dev-start]\033[0m %s\n' "$1" >&2; }

cleanup() {
  info "Shutting down..."
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1" pid="$2" label="$3" tries=60
  while (( tries > 0 )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
    (( tries-- ))
  done
  return 1
}

# --- Frontend ------------------------------------------------------------
info "Starting frontend server (npm run dev)..."
(cd "$ROOT_DIR/apps/web" && npm run dev -- --host 127.0.0.1) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

if wait_for_url "$FRONTEND_URL" "$FRONTEND_PID" "frontend"; then
  ok "Frontend is running at $FRONTEND_URL (pid $FRONTEND_PID)"
else
  fail "Frontend failed to start. See $FRONTEND_LOG for details:"
  tail -n 20 "$FRONTEND_LOG" >&2 || true
  exit 1
fi

# --- Backend -----------------------------------------------------------
if [[ ! -f "$ROOT_DIR/apps/web/dist/index.html" ]]; then
  info "No built web UI found; running npm run build..."
  if ! (cd "$ROOT_DIR/apps/web" && npm run build) >"$LOG_DIR/web-build.log" 2>&1; then
    fail "Web UI build failed. See $LOG_DIR/web-build.log for details:"
    tail -n 20 "$LOG_DIR/web-build.log" >&2 || true
    exit 1
  fi
  ok "Web UI built."
fi

info "Starting backend server (cargo run)..."
(cd "$ROOT_DIR/server" && cargo run -- --static-dir "$ROOT_DIR/apps/web/dist") >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

if wait_for_url "$BACKEND_URL" "$BACKEND_PID" "backend"; then
  ok "Backend is running at $BACKEND_URL (pid $BACKEND_PID)"
else
  fail "Backend failed to start. See $BACKEND_LOG for details:"
  tail -n 20 "$BACKEND_LOG" >&2 || true
  exit 1
fi

# --- Open browser --------------------------------------------------------
info "Opening $FRONTEND_URL in the default browser..."
if command -v open >/dev/null 2>&1; then
  open "$FRONTEND_URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$FRONTEND_URL"
else
  fail "Could not detect a command to open the browser. Open $FRONTEND_URL manually."
fi

ok "Both servers are running. Logs: $BACKEND_LOG, $FRONTEND_LOG"
info "Press Ctrl+C to stop both servers."

trap - EXIT
wait "$BACKEND_PID" "$FRONTEND_PID"
