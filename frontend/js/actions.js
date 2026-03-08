export function createActions({ dom, state, storage, storageKeys, renderers, activity, protocol, ui, sendPacket }) {
  return {
    applyNick() {
      const nextNick = dom.nickInput.value.trim();
      if (!nextNick) {
        activity.pushTimeline({
          tone: "error",
          label: "CLIENT ERROR",
          body: "Choose a nickname before applying it.",
          meta: [],
        });
        return;
      }

      state.nick = nextNick;
      storage.write(storageKeys.nickname, nextNick);
      renderers.users();

      const data = JSON.stringify({ kind: "nick", nickname: nextNick });
      if (!sendPacket({ data, kind: "nick", preview: data, summary: `Nickname request: ${nextNick}` })) {
        activity.pushTimeline({
          tone: "system",
          label: "LOCAL STATE",
          body: `Nickname saved locally as ${nextNick}. It will be sent on the next successful connection.`,
          meta: [],
        });
      }
    },
    submitComposer() {
      const packet = protocol.buildPacket();
      if (!packet) return;
      if (sendPacket(packet) && dom.composerMode.value !== "json") {
        dom.composerInput.value = "";
        ui.updateComposerCount();
      }
    },
    clearTimeline() {
      state.timeline = [];
      renderers.timeline();
    },
    clearFrames() {
      state.frames = [];
      renderers.frames();
    },
    clearComposer() {
      dom.composerInput.value = "";
      ui.updateComposerCount();
      dom.composerInput.focus();
    },
    insertSampleJson() {
      dom.composerMode.value = "json";
      dom.composerInput.value = JSON.stringify(
        { kind: "chat", text: `Hello from ${state.nick || "lean-client"}` },
        null,
        2
      );
      ui.updateComposerMode();
      dom.composerInput.focus();
    },
    applyPreset(preset) {
      if (preset === "who") {
        dom.composerMode.value = "command";
        dom.composerInput.value = "who";
      } else if (preset === "nick") {
        dom.composerMode.value = "json";
        dom.composerInput.value = JSON.stringify(
          { kind: "nick", nickname: state.nick || "Ada" },
          null,
          2
        );
      } else if (preset === "action") {
        dom.composerMode.value = "action";
        dom.composerInput.value = "formalizes the protocol";
      } else if (preset === "json") {
        dom.composerMode.value = "json";
        dom.composerInput.value = JSON.stringify(
          { kind: "command", command: "/who" },
          null,
          2
        );
      } else if (preset === "binary") {
        dom.composerMode.value = "binary";
        dom.composerInput.value = "Lean binary demo payload";
      }

      ui.updateComposerMode();
      dom.composerInput.focus();
    },
  };
}