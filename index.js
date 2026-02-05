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
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    // Pi registration
    if (data.type === "register") {
      ws.role = "pi";
      ws.deviceId = data.deviceId;
      devices.set(data.deviceId, ws);
      console.log("Pi registered:", data.deviceId);
      return;
    }

    // Client attach
    if (data.type === "attach") {
      const pi = devices.get(data.deviceId);
      if (!pi) {
        ws.send(JSON.stringify({ type: "error", message: "Pi not found" }));
        return;
      }
      ws.role = "client";
      ws.targetPi = pi;
      console.log("Client attached to:", data.deviceId);
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
