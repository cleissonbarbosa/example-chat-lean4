export function createRenderers({ dom, state, formatters, helpers }) {
  return {
    timeline() {
      dom.timelineEl.innerHTML = "";
      if (state.timeline.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-state";
        empty.textContent = "No events yet. Open a session to see WebSocket traffic flow through the Lean server.";
        dom.timelineEl.appendChild(empty);
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
        time.textContent = formatters.time.format(entry.timestamp);

        header.append(label, time);

        const body = document.createElement("p");
        body.className = "timeline-body";
        body.textContent = entry.body;
        item.append(header, body);

        if (entry.meta?.length) {
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

        dom.timelineEl.appendChild(item);
      });

      dom.timelineEl.scrollTop = dom.timelineEl.scrollHeight;
    },
    frames() {
      dom.frameList.innerHTML = "";
      if (state.frames.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-state";
        empty.textContent = "Frames will appear here with direction, payload type and compact raw content.";
        dom.frameList.appendChild(empty);
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
        meta.textContent = `${formatters.bytes(frame.size)} • ${formatters.time.format(frame.timestamp)}`;

        const pre = document.createElement("pre");
        pre.textContent = frame.payload;

        head.append(title, meta);
        item.append(head, pre);
        dom.frameList.appendChild(item);
      });
    },
    features() {
      dom.featureList.innerHTML = "";
      state.features.forEach((feature) => {
        const item = document.createElement("li");
        item.textContent = feature;
        dom.featureList.appendChild(item);
      });
    },
    commands() {
      dom.commandList.innerHTML = "";
      state.commands.forEach((command) => {
        const item = document.createElement("li");
        item.textContent = command;
        dom.commandList.appendChild(item);
      });
    },
    users() {
      dom.usersEl.innerHTML = "";
      const sortedUsers = [...state.users].sort((left, right) => left.localeCompare(right));
      dom.userCountEl.textContent = String(sortedUsers.length);

      if (sortedUsers.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-state";
        empty.textContent = "No peers reported yet.";
        dom.usersEl.appendChild(empty);
        return;
      }

      sortedUsers.forEach((user) => {
        const item = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "user-dot";
        dot.style.backgroundColor = formatters.hashColor(user);

        const name = document.createElement("span");
        name.className = "user-name";
        name.textContent = user === state.nick ? `${user} (you)` : user;

        item.append(dot, name);
        dom.usersEl.appendChild(item);
      });
    },
    metrics() {
      const metrics = [
        ["Online Users", formatters.number.format(state.stats.onlineUsers || 0)],
        ["Messages", formatters.number.format(state.stats.totalMessages || 0)],
        ["Commands", formatters.number.format(state.stats.totalCommands || 0)],
        ["Broadcasts", formatters.number.format(state.stats.totalBroadcasts || 0)],
        ["Frames In", formatters.number.format(state.stats.totalFramesIn || 0)],
        ["Frames Out", formatters.number.format(state.stats.totalFramesOut || 0)],
        ["Bytes In", formatters.bytes(state.stats.totalBytesIn || 0)],
        ["Bytes Out", formatters.bytes(state.stats.totalBytesOut || 0)],
        ["Reconnects", formatters.number.format(state.reconnectAttempts)],
        ["Connected For", formatters.connectedFor()],
      ];

      dom.metricGrid.innerHTML = "";
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
        dom.metricGrid.appendChild(card);
      });
    },
    transport() {
      dom.socketUrlEl.textContent = state.transport.url || helpers.guessWebSocketUrl() || "Set a backend URL";
      dom.socketProtocolEl.textContent = state.transport.negotiatedProtocol || state.transport.configuredProtocol || "-";
      dom.connectionIdEl.textContent = String(state.transport.connectionId);
      dom.lastSequenceEl.textContent = String(state.transport.lastSequence || 0);
      dom.peerAddressEl.textContent = state.transport.peer || "-";
      dom.pingIntervalEl.textContent = state.transport.pingInterval === "-" ? "-" : `${state.transport.pingInterval}s`;
      dom.missedPongsEl.textContent = String(state.transport.maxMissedPongs);
      dom.maxMessageSizeEl.textContent =
        state.transport.maxMessageSize === "-" ? "-" : formatters.bytes(state.transport.maxMessageSize);
    },
    all() {
      this.features();
      this.commands();
      this.users();
      this.metrics();
      this.transport();
    },
  };
}

export function createActivity({ state, renderers }) {
  return {
    pushTimeline(item) {
      state.timeline.push({ ...item, timestamp: Date.now() });
      state.timeline = state.timeline.slice(-60);
      renderers.timeline();
    },
    pushFrame(direction, kind, payload, size) {
      state.frames.push({ direction, kind, payload, size, timestamp: Date.now() });
      state.frames = state.frames.slice(-24);
      renderers.frames();
    },
  };
}