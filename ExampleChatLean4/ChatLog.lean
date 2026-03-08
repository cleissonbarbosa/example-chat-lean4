import WebSocket
import WebSocket.Log

/-!
Logging helpers for the chat example.

Provides:
* `levelPriority` : ordering for log-level filtering.
* `mkLogger` : builds a filtered logger function `(LogLevel → String → IO Unit)`.
* `parseLogLevel` : parse user-provided textual log level.

Intended usage: `let log := mkLogger desiredMinLevel` then use `log .info "msg"` etc.
-/
namespace Examples.Chat

open WebSocket

/-- Priority for log levels so we can filter. Lower = more verbose. -/
def levelPriority : WebSocket.LogLevel → Nat
  | .trace => 0
  | .debug => 1
  | .info  => 2
  | .warn  => 3
  | .error => 4

/-- Build a logger function that filters below the given minimum level. -/
def mkLogger (min : WebSocket.LogLevel) : (WebSocket.LogLevel → String → IO Unit) :=
  fun lvl msg =>
    if levelPriority lvl >= levelPriority min then
      WebSocket.logMod lvl "Chat" msg
    else
      pure ()

/-- Parse a textual log level (case-insensitive). Returns `none` if invalid. -/
def parseLogLevel (s : String) : Option WebSocket.LogLevel :=
  match s.trim.toLower with
  | "trace" => some .trace
  | "debug" => some .debug
  | "info"  => some .info
  | "warn"  => some .warn
  | "warning" => some .warn
  | "error" => some .error
  | _ => none

end Examples.Chat
