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

    // Pi registers
    if (msg.type === "register") {
      ws.role = "pi";
      ws.deviceId = msg.deviceId;
      devices.set(msg.deviceId, ws);
      console.log("Pi registered:", msg.deviceId);
      return;
    }

    // Client attaches
    if (msg.type === "attach") {
      const pi = devices.get(msg.deviceId);
      if (!pi) {
        ws.send(JSON.stringify({ type: "error", message: "Pi not found" }));
        return;
      }
      ws.role = "client";
      ws.targetPi = pi;
      pi.client = ws;
      console.log("Client attached:", msg.deviceId);
      return;
    }

    // Client sends command
    if (msg.type === "cmd" && ws.role === "client" && ws.targetPi) {
      ws.targetPi.send(JSON.stringify(msg));
      return;
    }

    // Pi sends output
    if (msg.type === "output" && ws.role === "pi" && ws.client) {
      ws.client.send(JSON.stringify(msg));
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
