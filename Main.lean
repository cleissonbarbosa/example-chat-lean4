import ExampleChatLean4.ChatServer
import ExampleChatLean4.ChatLog

/-! Application entrypoint.
Environment variables:
  CHAT_PORT       : override port (default 9101)
  CHAT_LOG_LEVEL  : trace|debug|info|warn|error (default info)
-/
def main : IO Unit := do
  let envPort? ← IO.getEnv "CHAT_PORT"
  let envLvl? ← IO.getEnv "CHAT_LOG_LEVEL"
  let port := match envPort? with
    | some s => (s.toNat?).getD 9101
    | none => 9101
  let lvl := match envLvl? with
    | some s => (Examples.Chat.parseLogLevel s).getD .info
    | none => .info
  Examples.Chat.start port lvl
