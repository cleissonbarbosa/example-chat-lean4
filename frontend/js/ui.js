export function createUi({ dom, state, storage, storageKeys }) {
  return {
    applyTheme(theme) {
      state.theme = theme;
      document.body.classList.toggle("theme-light", theme === "light");
      document.body.classList.toggle("theme-dark", theme === "dark");
      dom.appEl.classList.toggle("theme-light", theme === "light");
      dom.appEl.classList.toggle("theme-dark", theme === "dark");
      dom.themeToggle.textContent = theme === "light" ? "Dark Theme" : "Light Theme";
      dom.themeColorMeta?.setAttribute("content", theme === "light" ? "#f2ede2" : "#08111f");
      storage.write(storageKeys.theme, theme);
    },
    setStatus(label, tone, detail) {
      dom.statusEl.textContent = label;
      dom.statusEl.className = `status-badge ${tone}`.trim();
      dom.statusDetailEl.textContent = detail;
    },
    updateComposerCount() {
      dom.composerCount.textContent = `${dom.composerInput.value.length} chars`;
    },
    updateComposerMode() {
      const mode = dom.composerMode.value;
      if (mode === "chat") {
        dom.composerHelp.textContent = "The UI will wrap your text as { kind: \"chat\", text: \"...\" }.";
        dom.composerInput.placeholder = "Type a chat message…";
      } else if (mode === "action") {
        dom.composerHelp.textContent = "Action frames become Lean-side /me events without relying on string commands.";
        dom.composerInput.placeholder = "Describe an action…";
      } else if (mode === "command") {
        dom.composerHelp.textContent = "Send a structured command frame. Examples: who, /who, nick Ada or /me proves a lemma.";
        dom.composerInput.placeholder = "Type a command payload…";
      } else if (mode === "json") {
        dom.composerHelp.textContent = "Raw JSON is validated locally before the WebSocket frame leaves the browser.";
        dom.composerInput.placeholder = '{"kind":"chat","text":"Hello from JSON"}';
      } else {
        dom.composerHelp.textContent = "Binary frames are encoded with TextEncoder so the server can demonstrate binary detection.";
        dom.composerInput.placeholder = "Binary payload text…";
      }
      this.updateComposerCount();
    },
  };
}