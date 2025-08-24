#!/usr/bin/env sh
# Simple helper to build and run the Lean chat backend + a static frontend server.
# Usage:
#   ./run.sh                # uses backend port 9101 and frontend 5173
#   CHAT_PORT=9200 ./run.sh  # change backend port
#   FRONTEND_PORT=8080 ./run.sh
#   ./run.sh --no-browser
#
# Requirements: lake, Lean toolchain already configured. To serve frontend it tries python3.
# If python3 is not available, it just prints instructions.

set -eu

# ---------- Settings ----------
CHAT_PORT="${CHAT_PORT:-9101}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
OPEN_BROWSER=1

for arg in "$@"; do
  case "$arg" in
    --no-browser) OPEN_BROWSER=0 ;;
    --help|-h)
      cat <<EOF
Options:
  --no-browser   Does not open the browser automatically.
  CHAT_PORT=XXXX  (env) Set backend port (default 9101)
  FRONTEND_PORT=XXXX (env) Set static server port (default 5173)
EOF
      exit 0
      ;;
  esac
done

# ---------- Utils ----------
color() { # $1=color $2=msg ; colors: green red yellow blue
  case "$1" in
    green) printf '\033[32m%s\033[0m\n' "$2" ;;
    red) printf '\033[31m%s\033[0m\n' "$2" ;;
    yellow) printf '\033[33m%s\033[0m\n' "$2" ;;
    blue) printf '\033[34m%s\033[0m\n' "$2" ;;
    *) printf '%s\n' "$2" ;;
  esac
}

# ---------- Build ----------
color blue "[build] Running lake build..."
lake build >/dev/null 2>&1 && color green "[build] OK" || { color red "[build] Failed"; exit 1; }

# ---------- Start backend ----------
color blue "[backend] Starting chat server (port $CHAT_PORT)..."
CHAT_PORT="$CHAT_PORT" lake exe example-chat-lean4 &
BACK_PID=$!
color green "[backend] PID $BACK_PID" || true

# Wait a few seconds for initial log (not mandatory)
sleep 1 || true

# ---------- Start frontend server ----------
if command -v python3 >/dev/null 2>&1; then
  color blue "[frontend] Serving ./frontend at http://localhost:$FRONTEND_PORT (python3)"
  # Use --directory if Python >= 3.7
  if python3 -c "import sys; exit(0 if sys.version_info >= (3,7) else 1)"; then
    (cd frontend && python3 -m http.server "$FRONTEND_PORT") &
  else
    (cd frontend && python3 -m http.server "$FRONTEND_PORT") &
  fi
  FRONT_PID=$!
else
  color yellow "[frontend] python3 not found. Please open 'frontend/index.html' manually in your browser."
  FRONT_PID=""
fi

# ---------- Cleanup ----------
cleanup() {
  color yellow "[shutdown] Shutting down..."
  [ -n "${FRONT_PID:-}" ] && kill "$FRONT_PID" 2>/dev/null || true
  kill "$BACK_PID" 2>/dev/null || true
  wait "$BACK_PID" 2>/dev/null || true
  [ -n "${FRONT_PID:-}" ] && wait "$FRONT_PID" 2>/dev/null || true
  color green "[shutdown] Done"
}
trap cleanup INT TERM EXIT

# ---------- Open browser ----------
if [ "$OPEN_BROWSER" = 1 ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    ( sleep 1; xdg-open "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1 || true ) &
  fi
fi

color green "[ready] Chat: ws://localhost:$CHAT_PORT  |  UI: http://localhost:$FRONTEND_PORT"
color blue "[tips] Use CTRL+C to stop. Adjust port: CHAT_PORT=9200 FRONTEND_PORT=5500 ./run.sh"

# ---------- Wait (foreground) ----------
# Keeps script alive while backend is running.
wait "$BACK_PID"
