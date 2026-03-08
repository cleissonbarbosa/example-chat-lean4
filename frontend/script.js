import { cacheDom } from "./js/dom.js";
import { storage, storageKeys } from "./js/storage.js";
import { createState, createFormatters } from "./js/state.js";
import { createHelpers } from "./js/helpers.js";
import { createUi } from "./js/ui.js";
import { createRenderers, createActivity } from "./js/renderers.js";
import { createProtocol } from "./js/protocol.js";
import { createSendPacket } from "./js/messaging.js";
import { createLayout } from "./js/layout.js";
import { createSocketClient } from "./js/socket-client.js";
import { createActions } from "./js/actions.js";
import { bindEvents } from "./js/events.js";

const dom = cacheDom();

if (dom.appEl) {
  const state = createState({ dom, storage, storageKeys });
  const formatters = createFormatters(state);
  const helpers = createHelpers({ state, storage, storageKeys });
  const ui = createUi({ dom, state, storage, storageKeys });
  const renderers = createRenderers({ dom, state, formatters, helpers });
  const activity = createActivity({ state, renderers });
  const protocol = createProtocol({
    dom,
    state,
    storage,
    storageKeys,
    helpers,
    activity,
    formatters,
  });
  const sendPacket = createSendPacket({ state, helpers, formatters, activity });
  const layout = createLayout({ dom, state, storage, storageKeys });
  const socketClient = createSocketClient({
    dom,
    state,
    storage,
    storageKeys,
    helpers,
    ui,
    activity,
    renderers,
    protocol,
    sendPacket,
  });
  const actions = createActions({
    dom,
    state,
    storage,
    storageKeys,
    renderers,
    activity,
    protocol,
    ui,
    sendPacket,
  });

  dom.wsUrlInput.value = helpers.guessWebSocketUrl();
  dom.subprotocolInput.value = storage.read(storageKeys.preferredSubprotocol, "chat");
  dom.nickInput.value = state.nick;

  ui.applyTheme(state.theme);
  ui.updateComposerMode();
  renderers.all();
  renderers.timeline();
  renderers.frames();
  layout.init();
  bindEvents({ dom, state, ui, activity, actions, socketClient, layout });

  activity.pushTimeline({
    tone: "system",
    label: "READY",
    body: "Frontend initialized. Open a session to inspect structured WebSocket traffic from Lean.",
    meta: [],
  });

  if (helpers.shouldAutoconnect()) {
    socketClient.connect(true);
  } else {
    ui.setStatus("Awaiting URL", "idle", "GitHub Pages is ready. Set a WebSocket backend URL to start the demo.");
    activity.pushTimeline({
      tone: "system",
      label: "PAGES MODE",
      body: "This hosted frontend is waiting for an explicit backend URL because GitHub Pages does not host the Lean WebSocket server.",
      meta: [],
    });
  }

  window.setInterval(() => renderers.metrics(), 1000);
}
