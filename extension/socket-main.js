(() => {
  const CHANNEL = "codex-ffb-socket-v1";

  function isDraftEndpoint(value) {
    return /fantasydraft\.espn\.com/i.test(String(value || ""));
  }

  function safeEndpoint(value) {
    try {
      const parsed = new URL(String(value), window.location.href);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return "fantasydraft.espn.com";
    }
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return window.btoa(binary);
  }

  async function serializeData(data) {
    if (typeof data === "string") return { dataType: "text", data };
    if (data instanceof ArrayBuffer) return { dataType: "binary", data: bytesToBase64(new Uint8Array(data)) };
    if (ArrayBuffer.isView(data)) return { dataType: "binary", data: bytesToBase64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) };
    if (data instanceof Blob) return { dataType: "binary", data: bytesToBase64(new Uint8Array(await data.arrayBuffer())) };
    return { dataType: "text", data: String(data ?? "") };
  }

  async function emitFrame(channel, direction, endpoint, data) {
    try {
      const serialized = await serializeData(data);
      if (serialized.dataType === "text") serialized.data = serialized.data.replace(/^TOKEN\s+\S+/gm, "TOKEN [REDACTED]");
      window.postMessage({
        channel: CHANNEL,
        frame: { timestamp: new Date().toISOString(), channel, direction, endpoint: safeEndpoint(endpoint), ...serialized },
      }, window.location.origin);
    } catch { /* ESPN must never be affected by archive failures. */ }
  }

  const NativeWebSocket = window.WebSocket;
  if (NativeWebSocket) {
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(Target, args) {
        const socket = Reflect.construct(Target, args);
        const endpoint = args[0];
        if (!isDraftEndpoint(endpoint)) return socket;
        socket.addEventListener("message", (event) => { void emitFrame("websocket", "incoming", endpoint, event.data); });
        const nativeSend = socket.send;
        socket.send = function send(data) {
          void emitFrame("websocket", "outgoing", endpoint, data);
          return nativeSend.call(this, data);
        };
        return socket;
      },
    });
  }

  const NativeEventSource = window.EventSource;
  if (NativeEventSource) {
    window.EventSource = new Proxy(NativeEventSource, {
      construct(Target, args) {
        const source = Reflect.construct(Target, args);
        const endpoint = args[0];
        if (isDraftEndpoint(endpoint)) {
          source.addEventListener("message", (event) => { void emitFrame("eventsource", "incoming", endpoint, event.data); });
        }
        return source;
      },
    });
  }
})();
