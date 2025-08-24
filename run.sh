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
CHAT_LOG_LEVEL="${CHAT_LOG_LEVEL:-}"
OPEN_BROWSER=1
FORCE=0

LOG_LEVEL_FLAG=""
for arg in "$@"; do
  case "$arg" in
  --no-browser) OPEN_BROWSER=0 ;;
  --force|-f) FORCE=1 ;;
  --log-level=*) CHAT_LOG_LEVEL="${arg#--log-level=}" ;;
  --port-frontend=*) FRONTEND_PORT="${arg#--port-frontend=}" ;;
  --port-backend=*) CHAT_PORT="${arg#--port-backend=}" ;;
    --help|-h)
      cat <<EOF
Options:
  --no-browser          Does not open the browser automatically.
  --force or -f         Kill any existing server process using the selected CHAT_PORT.
  --log-level=LV        Set minimum log level (trace|debug|info|warn|error)
  --port-backend=XXXX   Set backend port (same as CHAT_PORT env)
  --port-frontend=XXXX  Set frontend port (same as FRONTEND_PORT env)
  --help or -h          Show this help message

  CHAT_PORT=XXXX        (env) Set backend port (default 9101)
  FRONTEND_PORT=XXXX    (env) Set static server port (default 5173)
  CHAT_LOG_LEVEL=LV     (env) Same as --log-level
EOF
      exit 0
      ;;
  esac
done

# ---------- Utils (must be defined before use) ----------
color() { # $1=color $2=msg ; colors: green red yellow blue
  case "$1" in
    green) printf '\033[32m%s\033[0m\n' "$2" ;;
    red) printf '\033[31m%s\033[0m\n' "$2" ;;
    yellow) printf '\033[33m%s\033[0m\n' "$2" ;;
    blue) printf '\033[34m%s\033[0m\n' "$2" ;;
    *) printf '%s\n' "$2" ;;
  esac
}

# ---------- Port checks ----------
is_port_listening() {
  # $1 = port number
  p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | awk '{print $4}' | sed 's/.*://g' | grep -qx "$p" && return 0 || return 1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && return 0 || return 1
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tln 2>/dev/null | awk '{print $4}' | sed 's/.*://g' | grep -qx "$p" && return 0 || return 1
  else
    # Fallback: try to bind with nc (will fail if busy)
    if command -v nc >/dev/null 2>&1; then
      nc -l 127.0.0.1 "$p" </dev/null >/dev/null 2>&1 &
      pid=$!
      # Give it a moment
      sleep 0.1
      if kill -0 "$pid" 2>/dev/null; then
        # We successfully bound => port was free; clean up and report free
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
        return 1
      else
        # Could not bind => assume in use
        return 0
      fi
    fi
    return 1
  fi
}

if is_port_listening "$CHAT_PORT"; then
  if [ "$FORCE" = 1 ]; then
    color yellow "[force] Attempting to kill existing server(s) on port $CHAT_PORT..."
    # Find candidate PIDs (pattern match binary name). Fallback parse of ss output if needed.
    PIDS="$(ps -eo pid,cmd | awk '/example-chat-lean4/ {print $1}')"
    if [ -n "$PIDS" ]; then
      echo "$PIDS" | xargs -r kill 2>/dev/null || true
      sleep 0.2
      echo "$PIDS" | xargs -r kill -9 2>/dev/null || true
    fi
    # Re-check
    if is_port_listening "$CHAT_PORT"; then
      color red "[error] Port $CHAT_PORT still in use after --force attempt. Abort."
      exit 1
    else
      color green "[force] Cleared port $CHAT_PORT. Continuing."
    fi
  else
    color red "[error] Backend port $CHAT_PORT appears to be in use."
    color yellow "       Use: CHAT_PORT=9199 ./run.sh  (choose a free port)"
    color yellow "       Or stop the existing process (e.g., ss -tlnp | grep :$CHAT_PORT) or re-run with --force." 
    exit 1
  fi
fi

if [ "$FRONTEND_PORT" != "$CHAT_PORT" ] && is_port_listening "$FRONTEND_PORT"; then
  color yellow "[warn] Frontend port $FRONTEND_PORT already in use; static server will be skipped."
  SKIP_FRONTEND=1
else
  SKIP_FRONTEND=0
fi

# ---------- Build ----------
color blue "[build] Running lake build..."
if lake build >/dev/null 2>&1; then
  color green "[build] OK"
else
  color red "[build] Failed"
  exit 1
fi

# Determine executable path produced by Lake
BACK_BIN=".lake/build/bin/example-chat-lean4"
if [ ! -x "$BACK_BIN" ]; then
  color yellow "[warn] Built binary not found at $BACK_BIN; falling back to 'lake exe' wrapper."
  BACK_CMD="lake exe example-chat-lean4"
else
  BACK_CMD="$BACK_BIN"
fi

# ---------- Start backend ----------
if [ -n "$CHAT_LOG_LEVEL" ]; then
  LOG_LEVEL_FLAG="--log-level=$CHAT_LOG_LEVEL"
fi

color blue "[backend] Starting chat server (port $CHAT_PORT)${CHAT_LOG_LEVEL:+ level $CHAT_LOG_LEVEL}..."
env CHAT_PORT="$CHAT_PORT" CHAT_LOG_LEVEL="$CHAT_LOG_LEVEL" "$BACK_CMD" ${LOG_LEVEL_FLAG} &
BACK_PID=$!
color green "[backend] PID $BACK_PID" || true

# Optional small wait for initial log (not mandatory)
sleep 0.5 || true

# ---------- Start frontend server ----------
if [ "$SKIP_FRONTEND" = 0 ] && command -v python3 >/dev/null 2>&1; then
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
_CLEANED_UP=0
cleanup() {
  # Guard against reentry (signals during cleanup)
  if [ "$_CLEANED_UP" = 1 ]; then return; fi
  _CLEANED_UP=1
  color yellow "[shutdown] Shutting down..."
  # Kill frontend first
  [ -n "${FRONT_PID:-}" ] && kill "$FRONT_PID" 2>/dev/null || true
  # Kill backend by PID
  if kill -0 "$BACK_PID" 2>/dev/null; then
    kill "$BACK_PID" 2>/dev/null || true
    # Allow graceful exit
    for _ in 1 2 3; do
      if kill -0 "$BACK_PID" 2>/dev/null; then sleep 0.2; else break; fi
    done
    # Force if still alive
    if kill -0 "$BACK_PID" 2>/dev/null; then
      kill -KILL "$BACK_PID" 2>/dev/null || true
    fi
  fi
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
