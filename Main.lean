import ExampleChatLean4.ChatServer

/-- Application entrypoint. Port can be overridden by environment variable CHAT_PORT. -/
def main : IO Unit := do
  let envPort? ← IO.getEnv "CHAT_PORT"
  let port := match envPort? with
    | some s => (s.toNat?).getD 9101
    | none => 9101
  Examples.Chat.start port
