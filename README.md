# Example Chat Lean4

Multi‑client WebSocket chat server written in Lean 4 using the experimental [`websocket.lean`](https://github.com/cleissonbarbosa/websocket.lean) library.

## ✨ Features
Core (backend):
* Multi‑client broadcast over WebSocket.
* Commands:
  * `/nick NewName` change nickname.
  * `/who` list connected users.
  * `/me action` action / emote line.
* Join / leave system notifications.
* Message length limit (2000 chars) with rejection feedback.
* Keep‑alive (pings + missed pong tracking).
* Structured logging (module `Chat`).

Frontend (static `frontend/`):
* User list sidebar (auto updates on joins/leaves and `/who`).
* Nickname editor UI + persists during reconnection.
* Light / dark theme toggle (+ auto detect system preference).
* Colored nicknames (hash based) + you label.
* Timestamps, subtle animations, alternating backgrounds (light mode).
* Keyboard shortcuts (`/` focus input, `Esc` blur input).
* Auto‑reconnect with state restoration.

## 🛠 Stack
* Lean 4 (toolchain: `leanprover/lean4:v4.21.0`, see `lean-toolchain`).
* Lake (build & dependency manager).
* External dependency: [`websocket`](https://github.com/cleissonbarbosa/websocket.lean) (rev `v0.1.3`).

## 📦 Project Layout
```
ExampleChatLean4/
  ChatServer.lean        -- chat server logic & event handler
  ChatLog.lean           -- logging helpers (filtering + parsing)
ExampleChatLean4.lean    -- library root
frontend/
  index.html             -- static UI
  style.css              -- themes + layout
  script.js              -- client logic
lakefile.toml            -- Lake config + dependencies
lean-toolchain           -- toolchain pin
Main.lean                -- entrypoint (reads CHAT_PORT)
run.sh                   -- helper script (build + run backend + static server)
```

## 🚀 Run
### 1. Quick start (recommended)
```bash
./run.sh
```
This builds the project, starts the backend (default `CHAT_PORT=9101`) and serves the frontend at `http://localhost:5173` (Python simple server). Press CTRL+C to stop.

Override ports:
```bash
CHAT_PORT=9200 FRONTEND_PORT=5555 ./run.sh
```
Or CLI flag
```bash
./run.sh --port-backend=9200 --port-frontend=5555
```
Set minimum log level (default info):
```bash
CHAT_LOG_LEVEL=debug ./run.sh
```
Or CLI flag:
```bash
./run.sh --log-level=trace
```
Skip auto browser open:
```bash
./run.sh --no-browser
```

### 2. Manual (Lake + separate static server)
```bash
lake build
CHAT_PORT=9101 lake exe example-chat-lean4
```
Then in another terminal:
```bash
cd frontend
python3 -m http.server 5173
```
Open http://localhost:5173 (UI) which connects to `ws://localhost:9101`.

Connect with a WebSocket client:
```bash
# wscat
wscat -c ws://localhost:9101

# websocat
websocat ws://localhost:9101
```

Try some commands after connecting:
```
/nick Alice
/me waves
/who
Hello everyone!
```

## ⚙️ Server Configuration
`ServerConfig` (in `ChatServer.lean`):
```lean
{ port := 9101,
  maxConnections := 200,
  pingInterval := 20,      -- seconds between pings
  maxMissedPongs := 2,     -- tolerated missed pongs
  maxMessageSize := 512 * 1024,
  subprotocols := ["chat"] }
```
Adjust values and rebuild.

### Frontend Details
* Auto connects to `ws://<host>:9101` unless served same‑origin reverse proxy.
* Light/dark theme saved to `localStorage`; first load respects system preference.
* User list updated via parsing join/leave/system + `/who` output.
* Nickname changes via UI send `/nick` automatically.
* If you just open `frontend/index.html` (file://) most browsers allow the websocket to localhost; if not, use a small HTTP server.

### Changing Port & Log Level at Runtime
Backend port comes from env var `CHAT_PORT` (default 9101). Log level comes from `CHAT_LOG_LEVEL` (default info). Examples:
```bash
CHAT_PORT=9300 CHAT_LOG_LEVEL=warn lake exe example-chat-lean4
CHAT_PORT=9300 CHAT_LOG_LEVEL=debug ./run.sh
./run.sh --log-level=error
```

## 📌 Suggested Next Steps
* Automated tests (simulate multiple clients, property checks on state transitions).
* Persist chat history (ring buffer in memory + optional file persistence).
* Multiple rooms / channels (extend `ChatState` with map room → users/messages).
* Private messages `/msg <nick> <text>` (direct sendTo + feedback if offline).
* Rate limiting / flood control (timestamps per user).
* WebSocket compression & TLS termination example via reverse proxy.
* Metrics (connections, messages, uptime) via Prometheus endpoint.
* Serve static frontend directly from Lean (HTTP handler integration).

## 📝 License
Educational example; reuse freely. The `websocket.lean` library is MIT licensed (see upstream repo).

---
Feel free to open issues or adapt the code. Happy hacking in Lean! 🧠