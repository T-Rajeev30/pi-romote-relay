const http = require("http");
const WebSocket = require("ws");
const DEVICE_TOKENS = {
  "pi-001": "SECRET_PI_001_TOKEN",
};

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Relay alive");
});

const wss = new WebSocket.Server({ server });

const devices = new Map(); // deviceId -> pi ws

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // --------------------
    // PI REGISTRATION
    // --------------------
    if (msg.type === "register") {
      if (DEVICE_TOKENS[msg.deviceId] !== msg.token) {
        ws.close();
        return;
      }
      ws.role = "pi";
      ws.deviceId = msg.deviceId;
      devices.set(msg.deviceId, ws);
      console.log("Pi registered:", msg.deviceId);
      return;
    }

    // --------------------
    // CLIENT ATTACH
    // --------------------
    if (msg.type === "attach") {
      const pi = devices.get(msg.deviceId);
      if (!pi) {
        ws.send(JSON.stringify({ type: "error", message: "Pi not found" }));
        return;
      }
      if (pi.client) {
        ws.send(JSON.stringify({ type: "error", message: "Pi is flag" }));
        return;
      }
      ws.role = "client";
      ws.targetPi = pi;
      pi.client = ws;
      console.log("Client attached (locked):", msg.deviceId);
      return;
    }

    // --------------------
    // CLIENT → PI (INPUT)
    // --------------------
    if (msg.type === "input" && ws.role === "client" && ws.targetPi) {
      ws.targetPi.send(JSON.stringify(msg));
      return;
    }

    if (msg.type === "resize" && ws.role === "client" && ws.targetPi) {
      ws.targetPi.send(JSON.stringify(msg));
      return;
    }

    // --------------------
    // PI → CLIENT (OUTPUT)
    // --------------------
    if (msg.type === "output" && ws.role === "pi" && ws.client) {
      ws.client.send(JSON.stringify(msg));
      return;
    }
  });

  ws.on("close", () => {
    if (ws.role === "client" && ws.targetPi) {
      ws.targetPi.client = null;
      console.log("Client released Pi");
    }
    if (ws.role === "pi" && ws.deviceId) {
      devices.delete(ws.deviceId);
      console.log("Pi disconnected:", ws.deviceId);
    }
  });
});

server.listen(process.env.PORT, () => {
  console.log("Relay listening");
});
