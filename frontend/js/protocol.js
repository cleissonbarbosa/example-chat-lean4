export function createProtocol({ dom, state, storage, storageKeys, helpers, activity, formatters }) {
  return {
    updateFromEnvelope(envelope) {
      if (typeof envelope.sequence === "number") {
        state.transport.lastSequence = envelope.sequence;
      }
      if (Array.isArray(envelope.users)) {
        state.users = envelope.users;
      }
      if (envelope.stats && typeof envelope.stats === "object") {
        state.stats = { ...state.stats, ...envelope.stats };
      }
      if (Array.isArray(envelope.commands) && envelope.commands.length > 0) {
        state.commands = envelope.commands;
      }
      if (Array.isArray(envelope.features) && envelope.features.length > 0) {
        state.features = envelope.features;
      }
      if (typeof envelope.connectionId !== "undefined") {
        state.transport.connectionId = envelope.connectionId;
      }
      if (envelope.transport && typeof envelope.transport === "object") {
        state.transport.pingInterval = envelope.transport.pingInterval ?? state.transport.pingInterval;
        state.transport.maxMissedPongs = envelope.transport.maxMissedPongs ?? state.transport.maxMissedPongs;
        state.transport.maxMessageSize = envelope.transport.maxMessageSize ?? state.transport.maxMessageSize;
      }
      if (envelope.peer) {
        state.transport.peer = envelope.peer;
      }
      if (envelope.nickname && envelope.kind === "hello" && !state.nick) {
        state.nick = envelope.nickname;
        dom.nickInput.value = state.nick;
        storage.write(storageKeys.nickname, state.nick);
      }
      if (
        envelope.kind === "presence" &&
        envelope.event === "renamed" &&
        envelope.previousNickname === state.nick
      ) {
        state.nick = envelope.nickname;
        dom.nickInput.value = state.nick;
        storage.write(storageKeys.nickname, state.nick);
      }
    },
    describeEnvelope(envelope) {
      if (envelope.kind === "hello") {
        return {
          tone: "system",
          label: "HELLO",
          body: envelope.text || "Server handshake received.",
          meta: [`Conn ${envelope.connectionId}`, `v${envelope.protocolVersion || 1}`],
        };
      }
      if (envelope.kind === "chat") {
        return {
          tone: envelope.nickname === state.nick ? "self" : "chat",
          label: "CHAT",
          body: `${envelope.nickname || "anon"}: ${envelope.text || ""}`,
          meta: [`seq ${envelope.sequence || 0}`],
        };
      }
      if (envelope.kind === "action") {
        return {
          tone: "action",
          label: "ACTION",
          body: `${envelope.nickname || "anon"} ${envelope.text || ""}`,
          meta: [`seq ${envelope.sequence || 0}`],
        };
      }
      if (envelope.kind === "presence") {
        return {
          tone: "presence",
          label: `PRESENCE • ${(envelope.event || "update").toUpperCase()}`,
          body: envelope.text || "Presence updated.",
          meta: [`Users ${envelope.users ? envelope.users.length : state.users.length}`],
        };
      }
      if (envelope.kind === "users") {
        return {
          tone: "system",
          label: "ROSTER",
          body: envelope.text || "User roster updated.",
          meta: [`Users ${envelope.users ? envelope.users.length : state.users.length}`],
        };
      }
      if (envelope.kind === "telemetry") {
        return {
          tone: "telemetry",
          label: `TELEMETRY • ${(envelope.event || "event").toUpperCase()}`,
          body: envelope.text || "Transport telemetry event.",
          meta: envelope.payloadSize ? [formatters.bytes(envelope.payloadSize)] : [],
        };
      }
      if (envelope.kind === "error") {
        return {
          tone: "error",
          label: "SERVER ERROR",
          body: envelope.text || "The server rejected the frame.",
          meta: envelope.hint ? [envelope.hint] : [],
        };
      }
      return {
        tone: "system",
        label: (envelope.kind || "event").toUpperCase(),
        body: envelope.text || "Frame received.",
        meta: envelope.sequence ? [`seq ${envelope.sequence}`] : [],
      };
    },
    buildPacket() {
      const raw = dom.composerInput.value.trim();
      const mode = dom.composerMode.value;

      if (mode !== "binary" && !raw) return null;

      if (mode === "chat") {
        const data = JSON.stringify({ kind: "chat", text: raw });
        return { data, kind: "chat", preview: data, summary: raw };
      }
      if (mode === "action") {
        const data = JSON.stringify({ kind: "action", text: raw });
        return { data, kind: "action", preview: data, summary: raw };
      }
      if (mode === "command") {
        const data = JSON.stringify({ kind: "command", command: raw });
        return { data, kind: "command", preview: data, summary: raw };
      }
      if (mode === "json") {
        const parsed = helpers.safeParseJson(raw);
        if (!parsed) {
          activity.pushTimeline({
            tone: "error",
            label: "CLIENT ERROR",
            body: "The JSON payload is invalid. Fix the syntax before sending.",
            meta: [],
          });
          return null;
        }
        const data = JSON.stringify(parsed);
        return { data, kind: parsed.kind || "json", preview: data, summary: "Raw JSON frame sent." };
      }

      const payload = raw || "lean4-binary-demo";
      const bytes = new TextEncoder().encode(payload);
      return {
        data: bytes,
        kind: "binary",
        preview: `[${Array.from(bytes).join(", ")}]`,
        summary: `Binary demo payload: ${payload}`,
      };
    },
  };
}