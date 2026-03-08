export function createSocketClient({
  dom,
  state,
  storage,
  storageKeys,
  helpers,
  ui,
  activity,
  renderers,
  protocol,
  sendPacket,
}) {
  return {
    clearReconnectTimer() {
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
    },
    scheduleReconnect() {
      if (state.manualClose || state.reconnectTimer) return;
      state.reconnectAttempts += 1;
      const delay = Math.min(2000 + state.reconnectAttempts * 1000, 8000);
      ui.setStatus("Retrying", "warning", `Reconnecting in ${(delay / 1000).toFixed(0)} seconds…`);
      renderers.metrics();
      state.reconnectTimer = window.setTimeout(() => {
        state.reconnectTimer = null;
        this.connect(false);
      }, delay);
    },
    connect(resetAttempts) {
      this.clearReconnectTimer();
      state.manualClose = false;

      if (resetAttempts) {
        state.reconnectAttempts = 0;
      }

      const url = dom.wsUrlInput.value.trim() || helpers.guessWebSocketUrl();
      const protocolName = dom.subprotocolInput.value.trim();

      if (!url) {
        ui.setStatus("Awaiting URL", "idle", "Set the WebSocket backend URL before opening a session.");
        activity.pushTimeline({
          tone: "system",
          label: "CONFIGURATION",
          body: "The GitHub Pages build serves only the frontend. Point the UI at a reachable WebSocket backend first.",
          meta: [],
        });
        return;
      }

      storage.write(storageKeys.preferredWsUrl, url);
      storage.write(storageKeys.preferredSubprotocol, protocolName || "chat");

      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.close(1000, "reconnect");
      }

      ui.setStatus("Connecting", "warning", `Opening ${url}…`);
      state.transport.url = url;
      state.transport.configuredProtocol = protocolName || "chat";
      renderers.transport();

      try {
        state.ws = protocolName ? new WebSocket(url, protocolName) : new WebSocket(url);
      } catch (error) {
        ui.setStatus("Connection Failed", "error", "The browser rejected the connection parameters.");
        activity.pushTimeline({
          tone: "error",
          label: "CLIENT ERROR",
          body: error instanceof Error ? error.message : "Unknown WebSocket construction error.",
          meta: [],
        });
        return;
      }

      state.ws.binaryType = "arraybuffer";

      state.ws.addEventListener("open", () => {
        state.reconnectAttempts = 0;
        state.transport.connectedAt = Date.now();
        state.transport.negotiatedProtocol = state.ws.protocol || protocolName || "-";
        ui.setStatus("Connected", "connected", "Lean server is streaming structured frames.");
        activity.pushTimeline({
          tone: "system",
          label: "SOCKET OPEN",
          body: `Connected to ${url}.`,
          meta: [state.transport.negotiatedProtocol || "no subprotocol"],
        });
        renderers.all();

        if (state.nick) {
          const data = JSON.stringify({ kind: "nick", nickname: state.nick });
          sendPacket({ data, kind: "nick", preview: data, summary: `Restoring nickname: ${state.nick}` });
        }
      });

      state.ws.addEventListener("message", (event) => {
        const raw = typeof event.data === "string" ? event.data : "[binary frame]";
        const size = typeof event.data === "string" ? helpers.byteSizeOf(event.data) : event.data.byteLength || 0;
        const parsed = typeof event.data === "string" ? helpers.safeParseJson(event.data) : null;

        activity.pushFrame("in", parsed?.kind || "text", raw, size);

        if (parsed && typeof parsed === "object") {
          protocol.updateFromEnvelope(parsed);
          activity.pushTimeline(protocol.describeEnvelope(parsed));
        } else {
          activity.pushTimeline({
            tone: "system",
            label: "PLAINTEXT",
            body: raw,
            meta: [],
          });
        }

        renderers.all();
      });

      state.ws.addEventListener("close", (event) => {
        state.transport.connectedAt = 0;
        state.transport.negotiatedProtocol = "-";
        ui.setStatus("Disconnected", "idle", `Socket closed with code ${event.code}.`);
        activity.pushTimeline({
          tone: "presence",
          label: "SOCKET CLOSED",
          body: `Connection closed${event.reason ? `: ${event.reason}` : "."}`,
          meta: [`code ${event.code}`],
        });
        renderers.metrics();
        renderers.transport();

        if (!state.manualClose) {
          this.scheduleReconnect();
        }
      });

      state.ws.addEventListener("error", () => {
        ui.setStatus("Transport Error", "error", "The browser reported a WebSocket transport problem.");
        activity.pushTimeline({
          tone: "error",
          label: "SOCKET ERROR",
          body: "A transport error occurred. The browser will typically follow with a close event.",
          meta: [],
        });
      });
    },
    disconnect() {
      state.manualClose = true;
      this.clearReconnectTimer();
      if (state.ws) {
        state.ws.close(1000, "manual disconnect");
      }
    },
  };
}