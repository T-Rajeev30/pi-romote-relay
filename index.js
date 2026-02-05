// index.js
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Relay alive");
});

const wss = new WebSocket.Server({ server });
const devices = new Map(); // deviceId -> ws

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "register") {
      ws.role = "pi";
      ws.deviceId = msg.deviceId;
      devices.set(msg.deviceId, ws);
      console.log("Pi registered:", msg.deviceId);
      return;
    }

    if (msg.type === "attach") {
      const pi = devices.get(msg.deviceId);
      if (!pi) {
        ws.send(JSON.stringify({ type: "error", message: "Pi not found" }));
        return;
      }
      ws.role = "client";
      ws.targetPi = pi;
      console.log("Client attached:", msg.deviceId);
      return;
    }
  });

  ws.on("close", () => {
    if (ws.role === "pi" && ws.deviceId) {
      devices.delete(ws.deviceId);
      console.log("Pi disconnected:", ws.deviceId);
    }
  });
});

server.listen(process.env.PORT, () => {
  console.log("Relay listening");
});
