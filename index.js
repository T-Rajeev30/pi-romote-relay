const http = require("http");
const WebSocket = require("ws");

/* ---------- SAFETY ---------- */
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

/* ---------- AUTH ---------- */
const DEVICE_TOKENS = {
  "pi-001": "SECRET_PI_001_TOKEN",
};

/* ---------- SERVER ---------- */
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Relay alive");
});

const wss = new WebSocket.Server({ server });
const devices = new Map();

/* ---------- HEARTBEAT ---------- */
function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ignore ping messages
    if (msg.type === "ping") return;

    /* ----- PI REGISTER ----- */
    if (msg.type === "register") {
      if (DEVICE_TOKENS[msg.deviceId] !== msg.token) {
        ws.close();
        return;
      }

      const old = devices.get(msg.deviceId);
      if (old) old.close();

      ws.role = "pi";
      ws.deviceId = msg.deviceId;
      devices.set(msg.deviceId, ws);

      console.log("Pi authenticated:", msg.deviceId);
      return;
    }

    /* ----- CLIENT ATTACH ----- */
    if (msg.type === "attach") {
      const pi = devices.get(msg.deviceId);

      if (!pi) {
        ws.send(JSON.stringify({ type: "error", message: "Pi not found" }));
        return;
      }

      if (pi.client) {
        ws.send(JSON.stringify({ type: "error", message: "Pi busy" }));
        return;
      }

      ws.role = "client";
      ws.targetPi = pi;
      pi.client = ws;

      console.log("Client attached:", msg.deviceId);
      return;
    }

    /* ----- CLIENT → PI ----- */
    if (msg.type === "input" && ws.role === "client") {
      ws.targetPi?.send(JSON.stringify(msg));
      return;
    }

    if (msg.type === "resize" && ws.role === "client") {
      ws.targetPi?.send(JSON.stringify(msg));
      return;
    }

    /* ----- PI → CLIENT ----- */
    if (msg.type === "output" && ws.role === "pi") {
      ws.client?.send(JSON.stringify(msg));
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

/* ---------- HEARTBEAT INTERVAL ---------- */
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/* ---------- START ---------- */
server.listen(process.env.PORT, () => {
  console.log("Relay listening");
});
