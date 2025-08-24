(() => {
  const $ = (s) => document.querySelector(s);
  const statusEl = $("#status");
  const logEl = $("#log");
  const usersEl = $("#users");
  const userCountEl = $("#userCount");
  const form = $("#inputForm");
  const input = $("#input");
  const nickInput = $("#nickInput");
  const setNickBtn = $("#setNickBtn");
  const themeToggle = $("#themeToggle");
  const app = $("#app");
  const body = document.body;

  const storedTheme = localStorage.getItem("theme");
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const state = {
    ws: null,
    nick: null,
    users: new Set(),
    colorMap: new Map(),
    theme: storedTheme || (prefersLight ? 'light' : 'dark'),
  };

  if (state.theme === "light") {
    app.classList.remove("theme-dark");
    app.classList.add("theme-light");
    body.classList.remove("theme-dark");
    body.classList.add("theme-light");
  }
  themeToggle.setAttribute('aria-label', 'Toggle theme');
  themeToggle.textContent = state.theme === 'light' ? '🌙' : '🌗';

  function hashColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++)
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return `hsl(${hue} 60% 55%)`;
  }

  function colorFor(nick) {
    if (!state.colorMap.has(nick)) state.colorMap.set(nick, hashColor(nick));
    return state.colorMap.get(nick);
  }

  function timestamp() {
    const d = new Date();
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function addLine(text, cls = "") {
    const div = document.createElement("div");
    div.className = "line " + cls;
    const ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = timestamp();
    div.appendChild(ts);
    // Try to color nickname inside [nick]
    const nickMatch = text.match(/^\[([^\]]+)\] (.*)$/);
    if (nickMatch) {
      const nickSpan = document.createElement("span");
      nickSpan.textContent = `[${nickMatch[1]}]`;
      nickSpan.style.color = colorFor(nickMatch[1]);
      nickSpan.style.fontWeight = "600";
      nickSpan.style.marginRight = "0.35rem";
      const rest = document.createElement("span");
      rest.textContent = nickMatch[2];
      div.appendChild(nickSpan);
      div.appendChild(rest);
    } else {
      div.appendChild(document.createTextNode(text));
    }
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(text, cls = "") {
    statusEl.textContent = text;
    statusEl.className = "status " + cls;
  }

  function updateUsersFromWho(line) {
    // line format: Users: name1, name2, name3  (as per server)
    const m = line.match(/^Users: (.*)$/);
    if (!m) return;
    state.users = new Set(m[1].split(/,\s*/).filter((x) => x));
    renderUsers();
  }

  function handleSystemNickChange(line) {
    const m = line.match(/\* ([^ ]+) is now ([^ ]+) \*/);
    if (m) {
      if (state.nick && state.nick === m[1]) state.nick = m[2];
      state.users.delete(m[1]);
      state.users.add(m[2]);
      renderUsers();
    }
  }

  function handleJoinLeave(line) {
    const mJoin = line.match(/\* (.+) joined \*/);
    const mLeave = line.match(/\* (.+) left \*/);
    if (mJoin) {
      state.users.add(mJoin[1]);
      renderUsers();
    }
    if (mLeave) {
      state.users.delete(mLeave[1]);
      renderUsers();
    }
  }

  function renderUsers() {
    usersEl.innerHTML = "";
    const sorted = Array.from(state.users).sort((a, b) => a.localeCompare(b));
    sorted.forEach((u) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "color";
      dot.style.background = colorFor(u);
      const name = document.createElement("span");
      name.textContent = u === state.nick ? `${u} (you)` : u;
      li.appendChild(dot);
      li.appendChild(name);
      usersEl.appendChild(li);
    });
    userCountEl.textContent = String(sorted.length);
  }

  function send(txt) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(txt);
  }

  function requestWhoSoon() {
    setTimeout(() => send("/who"), 200);
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const port = location.port || (location.protocol === "https:" ? 443 : 80);
    const backendPort =
      port === 9101 || port === 80 || port === 443 ? port : 9101;
    const url = `${proto}//${location.hostname}:${backendPort}`;
    const ws = new WebSocket(url, "chat");
    state.ws = ws;
    setStatus("Connecting…");
    ws.onopen = () => {
      setStatus("Connected", "connected");
      requestWhoSoon();
      if (state.nick) send(`/nick ${state.nick}`);
    };
    ws.onclose = (ev) => {
      setStatus("Disconnected", "");
      addLine(`* disconnected (${ev.code}) *`, "system");
      retry();
    };
    ws.onerror = () => setStatus("Error", "error");
    ws.onmessage = (ev) => {
      const msg = ev.data;
      if (/^\*/.test(msg)) {
        addLine(msg, "system");
        handleSystemNickChange(msg);
        handleJoinLeave(msg);
      } else if (/^Users: /.test(msg)) {
        updateUsersFromWho(msg);
        addLine(msg, "system");
      } else if (/^\[[^\]]+\]/.test(msg)) {
        const nick = msg.match(/^\[([^\]]+)/)[1];
        state.users.add(nick);
        renderUsers();
        const self = state.nick && msg.startsWith(`[${state.nick}]`);
        addLine(msg, self ? "self" : "");
      } else addLine(msg);
    };
  }

  let retryTimer = null;
  function retry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, 2000);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (text.startsWith("/nick "))
      state.nick = text.slice(6).trim() || state.nick;
    send(text);
    input.value = "";
  });

  setNickBtn.addEventListener("click", () => {
    const val = nickInput.value.trim();
    if (!val) return;
    state.nick = val;
    send(`/nick ${val}`);
  });
  nickInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setNickBtn.click();
    }
  });

  themeToggle.addEventListener("click", () => {
    const willBeLight = !(state.theme === 'light');
    state.theme = willBeLight ? 'light' : 'dark';
    app.classList.toggle('theme-light', willBeLight);
    app.classList.toggle('theme-dark', !willBeLight);
    body.classList.toggle('theme-light', willBeLight);
    body.classList.toggle('theme-dark', !willBeLight);
    localStorage.setItem('theme', state.theme);
    themeToggle.textContent = state.theme === 'light' ? '🌙' : '🌗';
    addLine(`* theme set to ${state.theme} *`, 'system');
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      document.activeElement !== input &&
      document.activeElement !== nickInput
    ) {
      input.focus();
    }
    if (e.key === "Escape" && document.activeElement === input) {
      input.blur();
    }
  });

  addLine("* Frontend loaded *", "system");
  connect();
})();
