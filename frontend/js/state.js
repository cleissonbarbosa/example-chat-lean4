export const defaultStats = {
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

export function detectPreferredTheme() {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  )
    ? "light"
    : "dark";
}

export function createState({ dom, storage, storageKeys }) {
  return {
    ws: null,
    manualClose: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    timeline: [],
    frames: [],
    users: [],
    theme: storage.read(storageKeys.theme, detectPreferredTheme()),
    nick: storage.read(storageKeys.nickname, ""),
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
    layout: {
      draggedId: null,
      defaultOrder: Array.from(dom.dashboardEl.children, (block) => block.dataset.blockId),
    },
  };
}

export function createFormatters(state) {
  return {
    time: new Intl.DateTimeFormat([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    number: new Intl.NumberFormat(),
    bytes(value) {
      if (!Number.isFinite(value) || value <= 0) return "0 B";
      const units = ["B", "KB", "MB", "GB"];
      let size = value;
      let unitIndex = 0;
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
      }
      return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    },
    connectedFor() {
      if (!state.transport.connectedAt) return "-";
      const elapsed = Math.max(0, Math.floor((Date.now() - state.transport.connectedAt) / 1000));
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    },
    hashColor(value) {
      let hash = 0;
      for (let index = 0; index < value.length; index += 1) {
        hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
      }
      return `hsl(${Math.abs(hash) % 360} 74% 58%)`;
    },
  };
}