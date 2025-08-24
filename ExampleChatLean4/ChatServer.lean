import WebSocket
import ExampleChatLean4.ChatLog
import WebSocket.Server
import WebSocket.Server.Events
import WebSocket.Server.Async
import WebSocket.Server.Messaging
import WebSocket.Server.KeepAlive

open WebSocket
open WebSocket.Server
open WebSocket.Server.Events
open WebSocket.Server.Async
open WebSocket.Server.Messaging


/-!
# Chat Server Example

Fully working multi-client chat example built on the Async server + EventManager.

Features:
* Broadcast text messages.
* `/nick NewName` to change nickname.
* Join / leave status messages.
* `/who` lists currently connected users (nicknames).
* `/me action` sends an action / emote line.
* Message length limit (2000 chars) with feedback.
* Structured logging via module `Chat`.

Simplifications:
* No persistence.
* Single global room (no channels).
* Failed sends simply drop the connection at lower layers.

Testing: open multiple WebSocket clients (e.g. `wscat -c ws://localhost:9101`) then use `/nick`.
-/

namespace Examples.Chat

structure ChatUser where
  id : Nat
  nickname : String := "anon"
  deriving Repr

structure ChatState where
  users : List ChatUser := []


/-- Ensure user exists (create with default nickname if missing). -/
private def ensureUser (st : ChatState) (id : Nat) : ChatState :=
  if st.users.any (·.id = id) then st else { st with users := { id, nickname := s!"user{id}" } :: st.users }

/-- Set or replace nickname. -/
private def setNick (st : ChatState) (id : Nat) (nick : String) : ChatState :=
  let newUsers := st.users.filter (·.id ≠ id)
  { st with users := { id, nickname := nick } :: newUsers }

private def findNick? (st : ChatState) (id : Nat) : Option String :=
  (st.users.find? (·.id = id)) |>.map (·.nickname)

private def userList (st : ChatState) : String :=
  st.users.map (·.nickname) |>.reverse |>.intersperse ", " |>.foldl (· ++ ·) ""

/-- Broadcast helper (text). -/
private def bcast (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (msg : String) : IO ChatState := do
  let srv ← asyncRef.get
  log .debug s!"Broadcasting ({msg.length} chars): {msg.take 80}{if msg.length > 80 then "…" else ""}"
  let newBase ← broadcastText srv.base msg
  let srv' := { srv with base := newBase }
  asyncRef.set srv'
  pure st

/-- Send only to one client. -/
private def sendTo (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (id : Nat) (msg : String) : IO ChatState := do
  let srv ← asyncRef.get
  log .trace s!"Sending to {id}: {msg.take 120}{if msg.length > 120 then "…" else ""}"
  let newBase ← sendText srv.base id msg
  let srv' := { srv with base := newBase }
  asyncRef.set srv'
  pure st

/-- Handle a textual command. Returns (newState, consumed?) where consumed indicates whether to suppress broadcast. -/
private def handleCommand (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (id : Nat) (raw : String) : IO (ChatState × Bool) := do
  if raw.startsWith "/nick " then
    let nick := raw.drop 6 |>.trim
    if nick.isEmpty then
      let st ← sendTo log asyncRef st id "Usage: /nick <new-name>"
      return (st, true)
    else
      let old := (findNick? st id).getD s!"user{id}"
      let st := setNick st id nick
      log .info s!"User {id} changed nick: {old} -> {nick}"
      let st ← bcast log asyncRef st s!"* {old} is now {nick} *"
      return (st, true)
  else if raw.startsWith "/who" then
    log .debug s!"User {id} requested /who"
    let st ← sendTo log asyncRef st id s!"Users: {userList st}"
    return (st, true)
  else if raw.startsWith "/me " then
    let action := raw.drop 4
    let nick := (findNick? st id).getD s!"user{id}"
    log .debug s!"/me from {nick} (id {id}): {action}"
    let st ← bcast log asyncRef st s!"* {nick} {action} *"
    return (st, true)
  else
    log .trace s!"Not a command from {id}: {raw.take 60}{if raw.length > 60 then "…" else ""}"
    pure (st, false)

/-- Process a user text message. -/
private def handleUserMessage (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (id : Nat) (txt : String) : IO ChatState := do
  -- Basic validation
  if txt.length > 2000 then
    log .warn s!"Rejecting overlong message from {id} ({txt.length} chars)"
    let st ← sendTo log asyncRef st id "Message too long (limit 2000)."
    return st
  -- Command?
  log .trace s!"Handling user message from {id}: size={txt.length}"
  let (st, consumed) ← handleCommand log asyncRef st id txt
  if consumed then
    log .trace s!"Command from {id} consumed message"
    return st
  let nick := (findNick? st id).getD s!"user{id}"
  log .debug s!"Broadcasting chat line from {nick} (id {id})"
  let st ← bcast log asyncRef st s!"[{nick}] {txt}"
  pure st

/-- Main event handler. -/
private def makeHandler (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (stateRef : IO.Ref ChatState) : EventHandler :=
  fun ev => do
  match ev with
  | .connected id addr => do
    log .info s!"Connection {id} from {addr}"
    stateRef.modify fun st => ensureUser st id
    let st ← stateRef.get
    let nick := (findNick? st id).getD s!"user{id}"
    let userCount := st.users.length
    log .debug s!"Initialized user state for {id} nick={nick} (total users: {userCount})"
    let st ← bcast log asyncRef st s!"* {nick} joined *"
    stateRef.set st
  | .disconnected id reason => do
    log .info s!"{id} left: {reason}"
    let st ← stateRef.get
    let nick := (findNick? st id).getD s!"user{id}"
    let st := { st with users := st.users.filter (·.id ≠ id) }
    let userCount := st.users.length
    log .debug s!"After disconnect {id}, users remaining: {userCount}"
    let st ← bcast log asyncRef st s!"* {nick} left *"
    stateRef.set st
  | .message id .text payload => do
    let txt := (String.fromUTF8? payload).getD "<invalid utf8>"
    log .trace s!"Incoming text frame from {id} ({payload.size} bytes)"
    let st ← stateRef.get
    let st ← handleUserMessage log asyncRef st id txt
    stateRef.set st
  | .message id .binary payload =>
    log .info s!"Ignoring binary from {id} ({payload.size} bytes)"
  | .message id .ping _ =>
    log .debug s!"Ping from {id}"
  | .message id .pong _ =>
    log .debug s!"Pong from {id}"
  | .message id .close _ =>
    log .info s!"Close frame received from {id}"
  | .message id .continuation _ =>
    log .debug s!"Ignoring continuation frame from {id}"
  | .error id err =>
    log .error s!"Error {id}: {err}"

/-! Low-level start function with configurable port and optional extra config modifier. -/
def start (port : Nat) (minLogLevel : LogLevel := .info) (modify? : ServerConfig → ServerConfig := id) : IO Unit := do
  let baseCfg : ServerConfig := {
    port := port,
    maxConnections := 200,
    pingInterval := 20,
    maxMissedPongs := 2,
    maxMessageSize := 512 * 1024,
    subprotocols := ["chat"]
  }
  let config := modify? baseCfg
  let log := mkLogger minLogLevel
  let async0 ← mkAsyncServer config
  let startedBase ← WebSocket.Server.Accept.start async0.base
  let asyncStarted := { async0 with base := startedBase }
  let asyncRef ← IO.mkRef asyncStarted
  let stateRef ← IO.mkRef ({ : ChatState })
  log .info s!"Chat server started on port {config.port}. Commands: /nick /who /me (minLogLevel={minLogLevel})"
  log .debug s!"Runtime config: maxConn={config.maxConnections} pingInterval={config.pingInterval}s maxMissed={config.maxMissedPongs} maxMsgSize={config.maxMessageSize} subprotocols={String.intercalate ", " config.subprotocols}"
  runAsyncServerUpdating asyncRef (makeHandler log asyncRef stateRef)

/-- Backwards-compatible entrypoint (default port 9101). -/
def main (args : List String) : IO Unit := do
  -- CLI: lake exe example-chat-lean4 -- [--port=NNNN] [--log-level=trace|debug|info|warn|error]
  let rec parse (args : List String) (port : Nat) (lvl : LogLevel) : (Nat × LogLevel) :=
    match args with
    | [] => (port, lvl)
    | a :: rest =>
      if a.startsWith "--port=" then
        match (a.drop 7).toNat? with
        | some p => parse rest p lvl
        | none => parse rest port lvl
      else if a.startsWith "--log-level=" then
        match parseLogLevel (a.drop 12) with
        | some l => parse rest port l
        | none => parse rest port lvl
      else
        parse rest port lvl
  let (port, lvl) := parse args 9101 .info
  start port lvl

end Examples.Chat
