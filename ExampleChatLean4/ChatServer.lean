import WebSocket
import Lean.Data.Json
import ExampleChatLean4.ChatLog
import WebSocket.Server
import WebSocket.Server.Events
import WebSocket.Server.Async
import WebSocket.Server.Messaging
import WebSocket.Server.KeepAlive

open WebSocket
open Lean
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

structure ChatStats where
  totalConnections : Nat := 0
  totalMessages : Nat := 0
  totalCommands : Nat := 0
  totalBroadcasts : Nat := 0
  totalFramesIn : Nat := 0
  totalFramesOut : Nat := 0
  totalBytesIn : Nat := 0
  totalBytesOut : Nat := 0
  deriving Repr

structure ChatState where
  users : List ChatUser := []
  stats : ChatStats := {}
  nextSequence : Nat := 1

structure IncomingEnvelope where
  kind : String
  text? : Option String := none
  nickname? : Option String := none
  command? : Option String := none
  deriving FromJson

private def nicknames (st : ChatState) : List String :=
  st.users.reverse.map (·.nickname)

private def statsJson (st : ChatState) : Json :=
  Json.mkObj
    [ ("onlineUsers", toJson st.users.length)
    , ("totalConnections", toJson st.stats.totalConnections)
    , ("totalMessages", toJson st.stats.totalMessages)
    , ("totalCommands", toJson st.stats.totalCommands)
    , ("totalBroadcasts", toJson st.stats.totalBroadcasts)
    , ("totalFramesIn", toJson st.stats.totalFramesIn)
    , ("totalFramesOut", toJson st.stats.totalFramesOut)
    , ("totalBytesIn", toJson st.stats.totalBytesIn)
    , ("totalBytesOut", toJson st.stats.totalBytesOut)
    ]

private def transportJson (config : ServerConfig) : Json :=
  Json.mkObj
    [ ("port", toJson config.port.toNat)
    , ("subprotocols", toJson config.subprotocols)
    , ("pingInterval", toJson config.pingInterval)
    , ("maxMissedPongs", toJson config.maxMissedPongs)
    , ("maxMessageSize", toJson config.maxMessageSize)
    , ("logLevel", toJson s!"{config.logLevelMin}")
    ]

private def bumpIncoming (st : ChatState) (payloadSize : Nat) : ChatState :=
  let stats := st.stats
  { st with
      stats :=
        { stats with
            totalFramesIn := stats.totalFramesIn + 1
            totalBytesIn := stats.totalBytesIn + payloadSize
        } }

private def bumpCommand (st : ChatState) : ChatState :=
  let stats := st.stats
  { st with stats := { stats with totalCommands := stats.totalCommands + 1 } }

private def bumpMessage (st : ChatState) : ChatState :=
  let stats := st.stats
  { st with stats := { stats with totalMessages := stats.totalMessages + 1 } }

private def bumpConnection (st : ChatState) : ChatState :=
  let stats := st.stats
  { st with stats := { stats with totalConnections := stats.totalConnections + 1 } }

private def nextEnvelope (st : ChatState) (kind : String) (extra : List (String × Json) := []) : Json × ChatState :=
  let seq := st.nextSequence
  let st' := { st with nextSequence := seq + 1 }
  let payload := Json.mkObj <|
    [ ("kind", toJson kind)
    , ("sequence", toJson seq)
    , ("users", toJson (nicknames st'))
    , ("stats", statsJson st')
    ] ++ extra
  (payload, st')

private def parseIncomingEnvelope? (raw : String) : Option IncomingEnvelope :=
  match Json.parse raw with
  | .ok json =>
      match fromJson? json with
      | .ok payload => some payload
      | .error _ => none
  | .error _ => none

private def normalizeCommand (cmd : String) : String :=
  let trimmed := cmd.trim
  if trimmed.startsWith "/" then trimmed else s!"/{trimmed}"


/-- Ensure user exists (create with default nickname if missing). -/
private def ensureUser (st : ChatState) (id : Nat) : ChatState :=
  if st.users.any (·.id = id) then st else { st with users := { id, nickname := s!"user{id}" } :: st.users }

/-- Set or replace nickname. -/
private def setNick (st : ChatState) (id : Nat) (nick : String) : ChatState :=
  let newUsers := st.users.filter (·.id ≠ id)
  { st with users := { id, nickname := nick } :: newUsers }

private def findNick? (st : ChatState) (id : Nat) : Option String :=
  (st.users.find? (·.id = id)) |>.map (·.nickname)

private def sendJsonTo (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (id : Nat) (kind : String) (extra : List (String × Json) := []) : IO ChatState := do
  let (payload, st') := nextEnvelope st kind extra
  let encoded := Json.compress payload
  let srv ← asyncRef.get
  log .trace s!"Sending {kind} to {id}: {encoded.take 180}{if encoded.length > 180 then "…" else ""}"
  let newBase ← sendText srv.base id encoded
  let srv' := { srv with base := newBase }
  asyncRef.set srv'
  let stats := st'.stats
  pure
    { st' with
        stats :=
          { stats with
              totalFramesOut := stats.totalFramesOut + 1
              totalBytesOut := stats.totalBytesOut + encoded.length
          } }

private def broadcastJson (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (kind : String) (extra : List (String × Json) := []) : IO ChatState := do
  let recipientCount := st.users.length
  let (payload, st') := nextEnvelope st kind extra
  let encoded := Json.compress payload
  let srv ← asyncRef.get
  log .debug s!"Broadcasting {kind} to {recipientCount} connection(s): {encoded.take 180}{if encoded.length > 180 then "…" else ""}"
  let newBase ← broadcastText srv.base encoded
  let srv' := { srv with base := newBase }
  asyncRef.set srv'
  let stats := st'.stats
  pure
    { st' with
        stats :=
          { stats with
              totalBroadcasts := stats.totalBroadcasts + 1
              totalFramesOut := stats.totalFramesOut + recipientCount
              totalBytesOut := stats.totalBytesOut + (encoded.length * recipientCount)
          } }

private def sendHello (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (config : ServerConfig) (st : ChatState) (id : Nat) (nick : String) (addr : String) : IO ChatState := do
  sendJsonTo log asyncRef st id "hello"
    [ ("server", toJson "example-chat-lean4")
    , ("protocolVersion", toJson 1)
    , ("connectionId", toJson id)
    , ("nickname", toJson nick)
    , ("peer", toJson addr)
    , ("text", toJson s!"Connected to the Lean 4 WebSocket demo as {nick}.")
    , ("commands", toJson ["/nick <new-name>", "/who", "/me <action>"])
    , ("features", toJson ["broadcast", "presence", "commands", "json-frames", "binary-frame-detection", "reconnect"])
    , ("transport", transportJson config)
    ]

/-- Handle a textual command. Returns (newState, consumed?) where consumed indicates whether to suppress broadcast. -/
private def handleCommand (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (id : Nat) (raw : String) : IO (ChatState × Bool) := do
  if raw.startsWith "/nick " then
    let st := bumpCommand st
    let nick := raw.drop 6 |>.trim
    if nick.isEmpty then
      let st ← sendJsonTo log asyncRef st id "error"
        [ ("text", toJson "Usage: /nick <new-name>.") ]
      return (st, true)
    else
      let old := (findNick? st id).getD s!"user{id}"
      let st := setNick st id nick
      log .info s!"User {id} changed nick: {old} -> {nick}"
      let st ← broadcastJson log asyncRef st "presence"
        [ ("event", toJson "renamed")
        , ("nickname", toJson nick)
        , ("previousNickname", toJson old)
        , ("connectionId", toJson id)
        , ("text", toJson s!"{old} is now {nick}.")
        ]
      return (st, true)
  else if raw.startsWith "/who" then
    let st := bumpCommand st
    log .debug s!"User {id} requested /who"
    let st ← sendJsonTo log asyncRef st id "users"
      [ ("requestedBy", toJson id)
      , ("text", toJson s!"{st.users.length} user(s) online.")
      ]
    return (st, true)
  else if raw.startsWith "/me " then
    let st := bumpCommand st
    let action := raw.drop 4 |>.trim
    if action.isEmpty then
      let st ← sendJsonTo log asyncRef st id "error"
        [ ("text", toJson "Usage: /me <action>.") ]
      return (st, true)
    let nick := (findNick? st id).getD s!"user{id}"
    log .debug s!"/me from {nick} (id {id}): {action}"
    let st := bumpMessage st
    let st ← broadcastJson log asyncRef st "action"
      [ ("nickname", toJson nick)
      , ("senderId", toJson id)
      , ("text", toJson action)
      ]
    return (st, true)
  else if raw.startsWith "/" then
    let st := bumpCommand st
    let st ← sendJsonTo log asyncRef st id "error"
      [ ("text", toJson s!"Unknown command: {raw}")
      , ("hint", toJson "Try /nick, /who or /me.")
      ]
    return (st, true)
  else
    log .trace s!"Not a command from {id}: {raw.take 60}{if raw.length > 60 then "…" else ""}"
    pure (st, false)

/-- Process a user text message. -/
private def handleUserMessage (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (id : Nat) (txt : String) : IO ChatState := do
  let txt := txt.trim
  if txt.isEmpty then
    return st
  -- Basic validation
  if txt.length > 2000 then
    log .warn s!"Rejecting overlong message from {id} ({txt.length} chars)"
    let st ← sendJsonTo log asyncRef st id "error"
      [ ("text", toJson "Message too long. Limit: 2000 characters.") ]
    return st
  -- Command?
  log .trace s!"Handling user message from {id}: size={txt.length}"
  let (st, consumed) ← handleCommand log asyncRef st id txt
  if consumed then
    log .trace s!"Command from {id} consumed message"
    return st
  let nick := (findNick? st id).getD s!"user{id}"
  log .debug s!"Broadcasting chat line from {nick} (id {id})"
  let st := bumpMessage st
  let st ← broadcastJson log asyncRef st "chat"
    [ ("nickname", toJson nick)
    , ("senderId", toJson id)
    , ("text", toJson txt)
    ]
  pure st

private def handleStructuredMessage (log : LogLevel → String → IO Unit) (asyncRef : IO.Ref AsyncServerState) (st : ChatState) (id : Nat) (msg : IncomingEnvelope) : IO ChatState := do
  let kind := msg.kind.trim.toLower
  if kind = "chat" then
    handleUserMessage log asyncRef st id (msg.text?.getD "")
  else if kind = "action" then
    handleUserMessage log asyncRef st id s!"/me {msg.text?.getD ""}"
  else if kind = "nick" then
    handleUserMessage log asyncRef st id s!"/nick {msg.nickname?.getD ""}"
  else if kind = "who" then
    handleUserMessage log asyncRef st id "/who"
  else if kind = "command" then
    let command := (msg.command?.orElse (fun _ => msg.text?)).getD ""
    if command.trim.isEmpty then
      sendJsonTo log asyncRef st id "error"
        [ ("text", toJson "Structured command frames need a command payload.") ]
    else
      handleUserMessage log asyncRef st id (normalizeCommand command)
  else
    sendJsonTo log asyncRef st id "error"
      [ ("text", toJson s!"Unsupported frame kind: {msg.kind}")
      , ("hint", toJson "Use chat, action, nick, who or command.")
      ]

/-- Main event handler. -/
private def makeHandler (log : LogLevel → String → IO Unit) (config : ServerConfig) (asyncRef : IO.Ref AsyncServerState) (stateRef : IO.Ref ChatState) : EventHandler :=
  fun ev => do
  match ev with
  | .connected id addr => do
    log .info s!"Connection {id} from {addr}"
    stateRef.modify fun st => bumpConnection (ensureUser st id)
    let st ← stateRef.get
    let nick := (findNick? st id).getD s!"user{id}"
    let userCount := st.users.length
    log .debug s!"Initialized user state for {id} nick={nick} (total users: {userCount})"
    let st ← sendHello log asyncRef config st id nick addr
    let st ← broadcastJson log asyncRef st "presence"
      [ ("event", toJson "joined")
      , ("nickname", toJson nick)
      , ("connectionId", toJson id)
      , ("text", toJson s!"{nick} joined the room.")
      ]
    stateRef.set st
  | .disconnected id reason => do
    log .info s!"{id} left: {reason}"
    let st ← stateRef.get
    let nick := (findNick? st id).getD s!"user{id}"
    let st := { st with users := st.users.filter (·.id ≠ id) }
    let userCount := st.users.length
    log .debug s!"After disconnect {id}, users remaining: {userCount}"
    let st ← broadcastJson log asyncRef st "presence"
      [ ("event", toJson "left")
      , ("nickname", toJson nick)
      , ("connectionId", toJson id)
      , ("reason", toJson reason)
      , ("text", toJson s!"{nick} left the room.")
      ]
    stateRef.set st
  | .message id .text payload => do
    let txt := (String.fromUTF8? payload).getD "<invalid utf8>"
    log .trace s!"Incoming text frame from {id} ({payload.size} bytes)"
    let st ← stateRef.get
    let st := bumpIncoming st payload.size
    let st ←
      if txt.trim.startsWith "{" then
        match parseIncomingEnvelope? txt with
        | some msg => handleStructuredMessage log asyncRef st id msg
        | none =>
            sendJsonTo log asyncRef st id "error" [
              ("text", toJson "Invalid JSON frame."),
              ("hint", toJson "Check the payload shape before sending.")
            ]
      else
        handleUserMessage log asyncRef st id txt
    stateRef.set st
  | .message id .binary payload => do
    log .info s!"Ignoring binary from {id} ({payload.size} bytes)"
    let st ← stateRef.get
    let st := bumpIncoming st payload.size
    let st ← sendJsonTo log asyncRef st id "telemetry"
      [ ("event", toJson "binary_ignored")
      , ("payloadSize", toJson payload.size)
      , ("text", toJson "Binary frame received. This demo routes text and JSON frames only.")
      ]
    stateRef.set st
  | .message id .ping payload => do
    log .debug s!"Ping from {id}"
    stateRef.modify fun st => bumpIncoming st payload.size
  | .message id .pong payload => do
    log .debug s!"Pong from {id}"
    stateRef.modify fun st => bumpIncoming st payload.size
  | .message id .close payload => do
    log .info s!"Close frame received from {id}"
    stateRef.modify fun st => bumpIncoming st payload.size
  | .message id .continuation payload => do
    log .debug s!"Ignoring continuation frame from {id}"
    stateRef.modify fun st => bumpIncoming st payload.size
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
  log .info s!"Chat server started on port {config.port}. Commands: /nick /who /me. Structured frames: chat/action/nick/who/command (minLogLevel={minLogLevel})"
  log .debug s!"Runtime config: maxConn={config.maxConnections} pingInterval={config.pingInterval}s maxMissed={config.maxMissedPongs} maxMsgSize={config.maxMessageSize} subprotocols={String.intercalate ", " config.subprotocols}"
  runAsyncServerUpdating asyncRef (makeHandler log config asyncRef stateRef)

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
