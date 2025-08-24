# Example Chat Lean4

Multi‑client WebSocket chat server written in Lean 4 using the experimental [`websocket.lean`](https://github.com/cleissonbarbosa/websocket.lean) library.

## ✨ Features
* Broadcast text messages to all connected clients.
* Commands:
  * `/nick NewName` changes your nickname.
  * `/who` lists currently connected users.
  * `/me action` sends an action / emote line.
* Join / leave system messages.
* Message length limit (2000 chars) with feedback when exceeded.
* Configurable WebSocket subprotocol (default: `chat`).
* Keep‑alive via periodic pings and missed‑pong tracking.
* Structured logging via `WebSocket.Log` (module "Chat").

## 🛠 Stack
* Lean 4 (toolchain: `leanprover/lean4:v4.21.0`, see `lean-toolchain`).
* Lake (build & dependency manager).
* External dependency: `websocket` (rev `v0.1.3`).

## 📦 Project Layout
```
ExampleChatLean4/
  ChatServer.lean    -- server logic & event handler
ExampleChatLean4.lean -- library root (can aggregate more modules)
Main.lean             -- entrypoint: starts chat server
lakefile.toml         -- Lake config + dependencies
```

## 🚀 Run
Build and start:
```bash
lake build
lake exe example-chat-lean4
```
Server listens on port `9101` (change in `ChatServer.lean`).

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

## 🔄 Development Cycle
```bash
# Update dependencies (after editing lakefile)
lake update

# Incremental build
lake build

# Clean build artifacts
lake clean
```

## 🧪 Manual Testing Ideas
1. Open 2+ clients, change `/nick`, exchange messages.
2. Send a message > 2000 chars and observe rejection notice.
3. Close a client and watch the leave broadcast.
4. Use `/me dances` and check formatting.

## 📌 Suggested Next Steps
* Automated tests (e.g. simulate transports with mocks from the WebSocket library).
* Persist chat history (file, ring buffer, or database).
* Multiple rooms / channels.
* Private messages: `/msg <nick> <text>`.
* Metrics export (users, messages, pings sent, uptime).

## 📝 License
Educational example; reuse freely. The `websocket.lean` library is MIT licensed (see upstream repo).

---
Feel free to open issues or adapt the code. Happy hacking in Lean! 🧠