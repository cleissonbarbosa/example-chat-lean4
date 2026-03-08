(() => {
  const $ = (selector) => document.querySelector(selector);
  const statusEl = $("#status");
  const statusDetailEl = $("#statusDetail");
  const appEl = $("#app");
  const themeToggle = $("#themeToggle");
  const reconnectBtn = $("#reconnectBtn");
  const disconnectBtn = $("#disconnectBtn");
  const connectionForm = $("#connectionForm");
  const wsUrlInput = $("#wsUrlInput");
  const subprotocolInput = $("#subprotocolInput");
  const nickInput = $("#nickInput");
  const applyNickBtn = $("#applyNickBtn");
  const metricGrid = $("#metricGrid");
  const usersEl = $("#users");
  const userCountEl = $("#userCount");
  const timelineEl = $("#timeline");
  const clearTimelineBtn = $("#clearTimelineBtn");
  const composerForm = $("#composerForm");
  const composerMode = $("#composerMode");
  const composerInput = $("#composerInput");
  const composerHelp = $("#composerHelp");
  const composerCount = $("#composerCount");
  const sendBtn = $("#sendBtn");
  const sampleJsonBtn = $("#sampleJsonBtn");
  const clearComposerBtn = $("#clearComposerBtn");
  const presetButtons = $("#presetButtons");
  const featureList = $("#featureList");
  const commandList = $("#commandList");
  const frameList = $("#frameList");
  const clearFramesBtn = $("#clearFramesBtn");
  const socketUrlEl = $("#socketUrl");
  const socketProtocolEl = $("#socketProtocol");
  const connectionIdEl = $("#connectionId");
  const lastSequenceEl = $("#lastSequence");
  const peerAddressEl = $("#peerAddress");
  const pingIntervalEl = $("#pingInterval");
  const missedPongsEl = $("#missedPongs");
  const maxMessageSizeEl = $("#maxMessageSize");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  const prefersLight =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  const defaultStats = {
    onlineUsers: 0,
    totalConnections: 0,
    totalMessages: 0,
    totalCommands: 0,
    totalBroadcasts: 0,
    totalFramesIn: 0,
    totalFramesOut: 0,
    totalBytesIn: 0,
    totalBytesOut: 0,
  };

  const state = {
    ws: null,
    manualClose: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    timeline: [],
    frames: [],
    users: [],
    theme: localStorage.getItem("theme") || (prefersLight ? "light" : "dark"),
    nick: localStorage.getItem("nickname") || "",
    stats: { ...defaultStats },
    commands: ["/nick <new-name>", "/who", "/me <action>"],
    features: ["broadcast", "presence", "commands", "json-frames"],
    transport: {
      url: "",
      configuredProtocol: "chat",
      negotiatedProtocol: "-",
      connectionId: "-",
      lastSequence: 0,
      peer: "-",
      pingInterval: "-",
      maxMissedPongs: "-",
      maxMessageSize: "-",
      connectedAt: 0,
    },
  };

  const timeFormatter = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const numberFormatter = new Intl.NumberFormat();

  function guessWebSocketUrl() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const host = location.hostname || "localhost";
    return `${protocol}://${host}:9101`;
  }

  function hashColor(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 74% 58%)`;
  }

  function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const digits = unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unitIndex]}`;
  }

  function formatConnectedFor() {
    if (!state.transport.connectedAt) return "-";
    const seconds = Math.max(0, Math.floor((Date.now() - state.transport.connectedAt) / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function isSocketOpen() {
    return state.ws && state.ws.readyState === WebSocket.OPEN;
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.body.classList.toggle("theme-light", theme === "light");
    document.body.classList.toggle("theme-dark", theme === "dark");
    appEl.classList.toggle("theme-light", theme === "light");
    appEl.classList.toggle("theme-dark", theme === "dark");
    themeToggle.textContent = theme === "light" ? "Dark Theme" : "Light Theme";
    themeColorMeta.setAttribute("content", theme === "light" ? "#f2ede2" : "#08111f");
    localStorage.setItem("theme", theme);
  }

  function setStatus(label, tone, detail) {
    statusEl.textContent = label;
    statusEl.className = `status-badge ${tone}`.trim();
    statusDetailEl.textContent = detail;
  }

  function pushTimeline(item) {
    state.timeline.push({
      ...item,
      timestamp: Date.now(),
    });
    state.timeline = state.timeline.slice(-60);
    renderTimeline();
  }

  function pushFrame(direction, kind, payload, size) {
    state.frames.push({
      direction,
      kind,
      payload,
      size,
      timestamp: Date.now(),
    });
    state.frames = state.frames.slice(-24);
    renderFrames();
  }

  function renderTimeline() {
    timelineEl.innerHTML = "";
    if (state.timeline.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No events yet. Open a session to see WebSocket traffic flow through the Lean server.";
      timelineEl.appendChild(empty);
      return;
    }

    state.timeline.forEach((entry) => {
      const item = document.createElement("li");
      item.className = `timeline-item ${entry.tone || "neutral"}`;

      const header = document.createElement("div");
      header.className = "timeline-header";

      const label = document.createElement("span");
      label.className = "timeline-label";
      label.textContent = entry.label;

      const time = document.createElement("time");
      time.className = "timeline-time";
      time.textContent = timeFormatter.format(entry.timestamp);

      header.append(label, time);

      const body = document.createElement("p");
      body.className = "timeline-body";
      body.textContent = entry.body;

      item.append(header, body);

      if (entry.meta && entry.meta.length) {
        const meta = document.createElement("div");
        meta.className = "timeline-meta";
        entry.meta.forEach((value) => {
          const chip = document.createElement("span");
          chip.className = "meta-chip";
          chip.textContent = value;
          meta.appendChild(chip);
        });
        item.appendChild(meta);
      }

      timelineEl.appendChild(item);
    });

    timelineEl.scrollTop = timelineEl.scrollHeight;
  }

  function renderFrames() {
    frameList.innerHTML = "";
    if (state.frames.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "Frames will appear here with direction, payload type and compact raw content.";
      frameList.appendChild(empty);
      return;
    }

    state.frames.forEach((frame) => {
      const item = document.createElement("li");
      item.className = `frame-card ${frame.direction}`;

      const head = document.createElement("div");
      head.className = "frame-head";

      const title = document.createElement("span");
      title.className = "frame-title";
      title.textContent = `${frame.direction.toUpperCase()} • ${frame.kind}`;

      const meta = document.createElement("span");
      meta.className = "frame-size";
      meta.textContent = `${formatBytes(frame.size)} • ${timeFormatter.format(frame.timestamp)}`;

      const pre = document.createElement("pre");
      pre.textContent = frame.payload;

      head.append(title, meta);
      item.append(head, pre);
      frameList.appendChild(item);
    });
  }

  function renderFeatures() {
    featureList.innerHTML = "";
    state.features.forEach((feature) => {
      const item = document.createElement("li");
      item.textContent = feature;
      featureList.appendChild(item);
    });
  }

  function renderCommands() {
    commandList.innerHTML = "";
    state.commands.forEach((command) => {
      const item = document.createElement("li");
      item.textContent = command;
      commandList.appendChild(item);
    });
  }

  function renderUsers() {
    usersEl.innerHTML = "";
    const sorted = [...state.users].sort((left, right) => left.localeCompare(right));
    userCountEl.textContent = String(sorted.length);

    if (sorted.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No peers reported yet.";
      usersEl.appendChild(empty);
      return;
    }

    sorted.forEach((user) => {
      const item = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "user-dot";
      dot.style.backgroundColor = hashColor(user);

      const name = document.createElement("span");
      name.className = "user-name";
      name.textContent = user === state.nick ? `${user} (you)` : user;

      item.append(dot, name);
      usersEl.appendChild(item);
    });
  }

  function renderMetrics() {
    const metrics = [
      ["Online Users", numberFormatter.format(state.stats.onlineUsers || 0)],
      ["Messages", numberFormatter.format(state.stats.totalMessages || 0)],
      ["Commands", numberFormatter.format(state.stats.totalCommands || 0)],
      ["Broadcasts", numberFormatter.format(state.stats.totalBroadcasts || 0)],
      ["Frames In", numberFormatter.format(state.stats.totalFramesIn || 0)],
      ["Frames Out", numberFormatter.format(state.stats.totalFramesOut || 0)],
      ["Bytes In", formatBytes(state.stats.totalBytesIn || 0)],
      ["Bytes Out", formatBytes(state.stats.totalBytesOut || 0)],
      ["Reconnects", numberFormatter.format(state.reconnectAttempts)],
      ["Connected For", formatConnectedFor()],
    ];

    metricGrid.innerHTML = "";
    metrics.forEach(([label, value]) => {
      const card = document.createElement("article");
      card.className = "metric-card";
      const kicker = document.createElement("span");
      kicker.className = "metric-label";
      kicker.textContent = label;
      const number = document.createElement("strong");
      number.className = "metric-value";
      number.textContent = value;
      card.append(kicker, number);
      metricGrid.appendChild(card);
    });
  }

  function renderTransport() {
    socketUrlEl.textContent = state.transport.url || guessWebSocketUrl();
    socketProtocolEl.textContent = state.transport.negotiatedProtocol || state.transport.configuredProtocol || "-";
    connectionIdEl.textContent = String(state.transport.connectionId);
    lastSequenceEl.textContent = String(state.transport.lastSequence || 0);
    peerAddressEl.textContent = state.transport.peer || "-";
    pingIntervalEl.textContent = state.transport.pingInterval === "-" ? "-" : `${state.transport.pingInterval}s`;
    missedPongsEl.textContent = String(state.transport.maxMissedPongs);
    maxMessageSizeEl.textContent = state.transport.maxMessageSize === "-" ? "-" : formatBytes(state.transport.maxMessageSize);
  }

  function renderAll() {
    renderFeatures();
    renderCommands();
    renderUsers();
    renderMetrics();
    renderTransport();
  }

  function updateComposerCount() {
    composerCount.textContent = `${composerInput.value.length} chars`;
  }

  function updateComposerMode() {
    const mode = composerMode.value;
    if (mode === "chat") {
      composerHelp.textContent = "The UI will wrap your text as { kind: \"chat\", text: \"...\" }.";
      composerInput.placeholder = "Type a chat message…";
    } else if (mode === "action") {
      composerHelp.textContent = "Action frames become Lean-side /me events without relying on string commands.";
      composerInput.placeholder = "Describe an action…";
    } else if (mode === "command") {
      composerHelp.textContent = "Send a structured command frame. Examples: who, /who, nick Ada or /me proves a lemma.";
      composerInput.placeholder = "Type a command payload…";
    } else if (mode === "json") {
      composerHelp.textContent = "Raw JSON is validated locally before the WebSocket frame leaves the browser.";
      composerInput.placeholder = '{"kind":"chat","text":"Hello from JSON"}';
    } else {
      composerHelp.textContent = "Binary frames are encoded with TextEncoder so the server can demonstrate binary detection.";
      composerInput.placeholder = "Binary payload text…";
    }
    updateComposerCount();
  }

  function safeParseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function updateFromEnvelope(envelope) {
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
      nickInput.value = state.nick;
      localStorage.setItem("nickname", state.nick);
    }
    if (envelope.kind === "presence" && envelope.event === "renamed" && envelope.previousNickname === state.nick) {
      state.nick = envelope.nickname;
      nickInput.value = state.nick;
      localStorage.setItem("nickname", state.nick);
    }
  }

  function describeEnvelope(envelope) {
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
        meta: envelope.payloadSize ? [formatBytes(envelope.payloadSize)] : [],
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
  }

  function byteSizeOf(value) {
    if (value instanceof Uint8Array) return value.byteLength;
    if (typeof value === "string") return new TextEncoder().encode(value).length;
    return 0;
  }

  function sendPacket(packet) {
    if (!isSocketOpen()) {
      pushTimeline({
        tone: "error",
        label: "CLIENT ERROR",
        body: "No active WebSocket session. Open a session before sending frames.",
        meta: [],
      });
      return false;
    }

    state.ws.send(packet.data);
    pushFrame("out", packet.kind, packet.preview, byteSizeOf(packet.data));
    pushTimeline({
      tone: "outbound",
      label: `OUTBOUND • ${packet.kind.toUpperCase()}`,
      body: packet.summary,
      meta: [formatBytes(byteSizeOf(packet.data))],
    });
    return true;
  }

  function buildPacket() {
    const raw = composerInput.value.trim();
    const mode = composerMode.value;

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
      const parsed = safeParseJson(raw);
      if (!parsed) {
        pushTimeline({
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
  }

  function applyNick() {
    const nextNick = nickInput.value.trim();
    if (!nextNick) {
      pushTimeline({
        tone: "error",
        label: "CLIENT ERROR",
        body: "Choose a nickname before applying it.",
        meta: [],
      });
      return;
    }

    state.nick = nextNick;
    localStorage.setItem("nickname", nextNick);
    renderUsers();

    const data = JSON.stringify({ kind: "nick", nickname: nextNick });
    if (!sendPacket({ data, kind: "nick", preview: data, summary: `Nickname request: ${nextNick}` })) {
      pushTimeline({
        tone: "system",
        label: "LOCAL STATE",
        body: `Nickname saved locally as ${nextNick}. It will be sent on the next successful connection.`,
        meta: [],
      });
    }
  }

  function clearReconnectTimer() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (state.manualClose || state.reconnectTimer) return;
    state.reconnectAttempts += 1;
    const delay = Math.min(2000 + state.reconnectAttempts * 1000, 8000);
    setStatus("Retrying", "warning", `Reconnecting in ${(delay / 1000).toFixed(0)} seconds…`);
    renderMetrics();
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      connect(false);
    }, delay);
  }

  function connect(resetAttempts) {
    clearReconnectTimer();
    state.manualClose = false;

    if (resetAttempts) {
      state.reconnectAttempts = 0;
    }

    const url = wsUrlInput.value.trim() || guessWebSocketUrl();
    const protocol = subprotocolInput.value.trim();

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.close(1000, "reconnect");
    }

    setStatus("Connecting", "warning", `Opening ${url}…`);
    state.transport.url = url;
    state.transport.configuredProtocol = protocol || "chat";
    renderTransport();

    try {
      state.ws = protocol ? new WebSocket(url, protocol) : new WebSocket(url);
    } catch (error) {
      setStatus("Connection Failed", "error", "The browser rejected the connection parameters.");
      pushTimeline({
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
      state.transport.negotiatedProtocol = state.ws.protocol || protocol || "-";
      setStatus("Connected", "connected", "Lean server is streaming structured frames.");
      pushTimeline({
        tone: "system",
        label: "SOCKET OPEN",
        body: `Connected to ${url}.`,
        meta: [state.transport.negotiatedProtocol || "no subprotocol"],
      });
      renderAll();

      if (state.nick) {
        const data = JSON.stringify({ kind: "nick", nickname: state.nick });
        sendPacket({ data, kind: "nick", preview: data, summary: `Restoring nickname: ${state.nick}` });
      }
    });

    state.ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : "[binary frame]";
      const size = typeof event.data === "string" ? byteSizeOf(event.data) : event.data.byteLength || 0;
      const parsed = typeof event.data === "string" ? safeParseJson(event.data) : null;
      pushFrame("in", parsed?.kind || "text", raw, size);

      if (parsed && typeof parsed === "object") {
        updateFromEnvelope(parsed);
        pushTimeline(describeEnvelope(parsed));
      } else {
        pushTimeline({
          tone: "system",
          label: "PLAINTEXT",
          body: raw,
          meta: [],
        });
      }

      renderAll();
    });

    state.ws.addEventListener("close", (event) => {
      state.transport.connectedAt = 0;
      state.transport.negotiatedProtocol = "-";
      setStatus("Disconnected", "idle", `Socket closed with code ${event.code}.`);
      pushTimeline({
        tone: "presence",
        label: "SOCKET CLOSED",
        body: `Connection closed${event.reason ? `: ${event.reason}` : "."}`,
        meta: [`code ${event.code}`],
      });
      renderMetrics();
      renderTransport();

      if (!state.manualClose) {
        scheduleReconnect();
      }
    });

    state.ws.addEventListener("error", () => {
      setStatus("Transport Error", "error", "The browser reported a WebSocket transport problem.");
      pushTimeline({
        tone: "error",
        label: "SOCKET ERROR",
        body: "A transport error occurred. The browser will typically follow with a close event.",
        meta: [],
      });
    });
  }

  connectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    connect(true);
  });

  applyNickBtn.addEventListener("click", applyNick);

  composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const packet = buildPacket();
    if (!packet) return;
    if (sendPacket(packet) && composerMode.value !== "json") {
      composerInput.value = "";
      updateComposerCount();
    }
  });

  themeToggle.addEventListener("click", () => {
    applyTheme(state.theme === "light" ? "dark" : "light");
    pushTimeline({
      tone: "system",
      label: "THEME",
      body: `Theme changed to ${state.theme}.`,
      meta: [],
    });
  });

  reconnectBtn.addEventListener("click", () => connect(true));

  disconnectBtn.addEventListener("click", () => {
    state.manualClose = true;
    clearReconnectTimer();
    if (state.ws) {
      state.ws.close(1000, "manual disconnect");
    }
  });

  clearTimelineBtn.addEventListener("click", () => {
    state.timeline = [];
    renderTimeline();
  });

  clearFramesBtn.addEventListener("click", () => {
    state.frames = [];
    renderFrames();
  });

  clearComposerBtn.addEventListener("click", () => {
    composerInput.value = "";
    updateComposerCount();
    composerInput.focus();
  });

  sampleJsonBtn.addEventListener("click", () => {
    composerMode.value = "json";
    composerInput.value = JSON.stringify(
      { kind: "chat", text: `Hello from ${state.nick || "lean-client"}` },
      null,
      2
    );
    updateComposerMode();
    composerInput.focus();
  });

  presetButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (!button) return;
    const preset = button.dataset.preset;
    if (preset === "who") {
      composerMode.value = "command";
      composerInput.value = "who";
    } else if (preset === "nick") {
      composerMode.value = "json";
      composerInput.value = JSON.stringify(
        { kind: "nick", nickname: state.nick || "Ada" },
        null,
        2
      );
    } else if (preset === "action") {
      composerMode.value = "action";
      composerInput.value = "formalizes the protocol";
    } else if (preset === "json") {
      composerMode.value = "json";
      composerInput.value = JSON.stringify(
        { kind: "command", command: "/who" },
        null,
        2
      );
    } else if (preset === "binary") {
      composerMode.value = "binary";
      composerInput.value = "Lean binary demo payload";
    }
    updateComposerMode();
    composerInput.focus();
  });

  composerMode.addEventListener("change", updateComposerMode);
  composerInput.addEventListener("input", updateComposerCount);

  window.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      document.activeElement !== composerInput &&
      document.activeElement !== nickInput
    ) {
      event.preventDefault();
      composerInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === composerInput) {
      composerInput.blur();
    }
  });

  wsUrlInput.value = guessWebSocketUrl();
  subprotocolInput.value = "chat";
  nickInput.value = state.nick;

  applyTheme(state.theme);
  updateComposerMode();
  renderAll();
  renderTimeline();
  renderFrames();

  pushTimeline({
    tone: "system",
    label: "READY",
    body: "Frontend initialized. Open a session to inspect structured WebSocket traffic from Lean.",
    meta: [],
  });

  connect(true);
  window.setInterval(renderMetrics, 1000);
})();
