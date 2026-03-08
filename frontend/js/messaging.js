export function createSendPacket({ state, helpers, formatters, activity }) {
  return function sendPacket(packet) {
    if (!helpers.isSocketOpen()) {
      activity.pushTimeline({
        tone: "error",
        label: "CLIENT ERROR",
        body: "No active WebSocket session. Open a session before sending frames.",
        meta: [],
      });
      return false;
    }

    state.ws.send(packet.data);
    activity.pushFrame("out", packet.kind, packet.preview, helpers.byteSizeOf(packet.data));
    activity.pushTimeline({
      tone: "outbound",
      label: `OUTBOUND • ${packet.kind.toUpperCase()}`,
      body: packet.summary,
      meta: [formatters.bytes(helpers.byteSizeOf(packet.data))],
    });
    return true;
  };
}