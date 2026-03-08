export const storageKeys = {
  theme: "theme",
  nickname: "nickname",
  preferredWsUrl: "preferred-ws-url",
  preferredSubprotocol: "preferred-subprotocol",
  dashboardOrder: "dashboard-block-order",
};

export const storage = {
  read(key, fallback = "") {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      return;
    }
  },
  readJson(key, fallback) {
    const raw = this.read(key, "");
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  writeJson(key, value) {
    this.write(key, JSON.stringify(value));
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      return;
    }
  },
};