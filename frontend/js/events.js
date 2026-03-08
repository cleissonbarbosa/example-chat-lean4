export function bindEvents({ dom, state, ui, activity, actions, socketClient, layout }) {
  dom.connectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    socketClient.connect(true);
  });

  dom.applyNickBtn.addEventListener("click", () => actions.applyNick());

  dom.composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    actions.submitComposer();
  });

  dom.themeToggle.addEventListener("click", () => {
    ui.applyTheme(state.theme === "light" ? "dark" : "light");
    activity.pushTimeline({
      tone: "system",
      label: "THEME",
      body: `Theme changed to ${state.theme}.`,
      meta: [],
    });
  });

  dom.reconnectBtn.addEventListener("click", () => socketClient.connect(true));
  dom.disconnectBtn.addEventListener("click", () => socketClient.disconnect());
  dom.resetLayoutBtn.addEventListener("click", () => layout.reset());
  dom.clearTimelineBtn.addEventListener("click", () => actions.clearTimeline());
  dom.clearFramesBtn.addEventListener("click", () => actions.clearFrames());
  dom.clearComposerBtn.addEventListener("click", () => actions.clearComposer());
  dom.sampleJsonBtn.addEventListener("click", () => actions.insertSampleJson());

  dom.presetButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (!button) return;
    actions.applyPreset(button.dataset.preset);
  });

  dom.composerMode.addEventListener("change", () => ui.updateComposerMode());
  dom.composerInput.addEventListener("input", () => ui.updateComposerCount());

  window.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      document.activeElement !== dom.composerInput &&
      document.activeElement !== dom.nickInput
    ) {
      event.preventDefault();
      dom.composerInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === dom.composerInput) {
      dom.composerInput.blur();
    }
  });
}