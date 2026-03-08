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
* Structured JSON envelopes for outbound events.
* Accepts either plain text commands or structured JSON frames from the client.

Frontend (static `frontend/`):
* Full WebSocket lab UI: timeline, transport summary, live metrics and raw frame inspector.
* Structured JSON protocol visualization (`hello`, `presence`, `chat`, `action`, `users`, `telemetry`, `error`).
* Connection controls for URL, subprotocol and nickname with auto‑reconnect + state restoration.
* Outbound frame composer with chat, action, command, raw JSON and binary demo modes.
* Command presets and capability panels to highlight how the Lean server routes frames.
* Light / dark theme toggle, keyboard shortcuts and responsive layout.

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

Or send structured JSON frames from the new frontend composer:

```json
{"kind":"chat","text":"Hello from JSON"}
{"kind":"action","text":"proves a theorem"}
{"kind":"nick","nickname":"Ada"}
{"kind":"command","command":"/who"}
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
* Auto connects to `ws://<host>:9101` with the `chat` subprotocol by default.
* The UI inspects raw inbound/outbound frames, server capabilities and aggregate counters in real time.
* Outbound frames can be authored as structured chat/action/command JSON, raw JSON or binary payloads.
* Nickname changes are persisted in `localStorage` and replayed after reconnect.
* Light/dark theme is saved to `localStorage`; first load respects system preference.
* On GitHub Pages, the UI waits for an explicit backend URL unless you provide `?ws=wss://your-backend.example` or a previously saved endpoint.
* If you open `frontend/index.html` via `file://`, browser websocket policies may vary; using `./run.sh` remains the safest path.

### GitHub Pages Deployment
The repository now includes a GitHub Actions workflow that publishes the `frontend/` directory to GitHub Pages on every push to `main` affecting the frontend.

To enable it in the repository settings:
1. Open Settings → Pages.
2. Set Source to GitHub Actions.
3. Push to `main` or run the workflow manually.

When the site is live, open it and set the WebSocket backend URL in the "Connection Controls" panel, or append `?ws=wss://your-backend.example` to the Pages URL.

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