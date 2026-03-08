export function createHelpers({ state, storage, storageKeys }) {
  return {
    isGitHubPagesHost() {
      return /github\.io$/i.test(location.hostname);
    },
    readPreferredWebSocketUrl() {
      const params = new URLSearchParams(location.search);
      return (params.get("ws") || storage.read(storageKeys.preferredWsUrl, "")).trim();
    },
    guessWebSocketUrl() {
      const preferred = this.readPreferredWebSocketUrl();
      if (preferred) return preferred;
      if (this.isGitHubPagesHost()) return "";
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const host = location.hostname || "localhost";
      return `${protocol}://${host}:9101`;
    },
    shouldAutoconnect() {
      return !this.isGitHubPagesHost() || Boolean(this.readPreferredWebSocketUrl());
    },
    safeParseJson(raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    byteSizeOf(value) {
      if (value instanceof Uint8Array) return value.byteLength;
      if (typeof value === "string") return new TextEncoder().encode(value).length;
      if (value instanceof ArrayBuffer) return value.byteLength;
      return 0;
    },
    isSocketOpen() {
      return Boolean(state.ws && state.ws.readyState === WebSocket.OPEN);
    },
  };
}