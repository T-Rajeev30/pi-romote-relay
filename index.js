// relay.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

const devices = new Map(); // deviceId -> ws
const clients = new Map(); // ws -> deviceId

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === "register" && data.role === "pi") {
      devices.set(data.deviceId, ws);
      ws.deviceId = data.deviceId;
      return;
    }

    if (data.type === "attach") {
      const pi = devices.get(data.deviceId);
      if (!pi) return;
      clients.set(ws, data.deviceId);
      ws.pi = pi;
      return;
    }

    if (data.type === "cmd" && ws.pi) {
      ws.pi.send(JSON.stringify(data));
    }
  });

  ws.on("close", () => {
    if (ws.deviceId) devices.delete(ws.deviceId);
    clients.delete(ws);
  });
});
