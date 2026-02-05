const http = require("http");
const WebSocket = require("ws");
/* ---------- AUTH ---------- */
const DEVICE_TOKENS = {
  "pi-001": "SECRET_PI_001_TOKEN", // Remove the environment variable check
};
/* ---------- SAFETY ---------- */
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

/* ---------- AUTH ---------- */

/* ---------- SERVER ---------- */
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Relay alive");
});

const wss = new WebSocket.Server({
  server,
  maxPayload: 1024 * 1024, // 1MB max message size
});

const devices = new Map();

/* ---------- SAFE SEND ---------- */
function safeSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error("Send error:", err.message);
    }
  }
}

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

    // Ignore ping messages
    if (msg.type === "ping") return;

    /* ----- PI REGISTER ----- */
    if (msg.type === "register") {
      if (DEVICE_TOKENS[msg.deviceId] !== msg.token) {
        console.log("Auth failed for:", msg.deviceId);
        ws.close();
        return;
      }

      const old = devices.get(msg.deviceId);
      if (old) {
        console.log("Replacing old Pi connection:", msg.deviceId);
        old.close();
      }

      ws.role = "pi";
      ws.deviceId = msg.deviceId;
      devices.set(msg.deviceId, ws);

      console.log("Pi authenticated:", msg.deviceId);
      safeSend(ws, { type: "registered", deviceId: msg.deviceId });
      return;
    }

    /* ----- CLIENT ATTACH ----- */
    if (msg.type === "attach") {
      const pi = devices.get(msg.deviceId);

      if (!pi) {
        safeSend(ws, { type: "error", message: "Pi not found" });
        return;
      }

      if (pi.client) {
        safeSend(ws, { type: "error", message: "Pi busy" });
        return;
      }

      ws.role = "client";
      ws.targetPi = pi;
      pi.client = ws;

      console.log("Client attached:", msg.deviceId);
      safeSend(ws, { type: "attached", deviceId: msg.deviceId });
      return;
    }

    /* ----- CLIENT → PI ----- */
    if (msg.type === "input" && ws.role === "client") {
      if (ws.targetPi) {
        safeSend(ws.targetPi, msg);
      }
      return;
    }

    if (msg.type === "resize" && ws.role === "client") {
      if (ws.targetPi) {
        safeSend(ws.targetPi, msg);
      }
      return;
    }

    /* ----- PI → CLIENT ----- */
    if (msg.type === "output" && ws.role === "pi") {
      if (ws.client) {
        safeSend(ws.client, msg);
      }
      return;
    }
  });

  ws.on("close", () => {
    if (ws.role === "client" && ws.targetPi) {
      ws.targetPi.client = null;
      console.log("Client released Pi:", ws.targetPi.deviceId);
    }

    if (ws.role === "pi" && ws.deviceId) {
      if (ws.client) {
        safeSend(ws.client, {
          type: "error",
          message: "Pi disconnected",
        });
        ws.client.close();
      }
      devices.delete(ws.deviceId);
      console.log("Pi disconnected:", ws.deviceId);
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

/* ---------- HEARTBEAT INTERVAL ---------- */
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log("Terminating dead connection");
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/* ---------- GRACEFUL SHUTDOWN ---------- */
function shutdown() {
  console.log("Shutting down relay...");
  clearInterval(heartbeatInterval);

  wss.clients.forEach((ws) => {
    ws.close();
  });

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error("Forced shutdown");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/* ---------- START ---------- */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Relay listening on port ${PORT}`);
  console.log(`Registered devices: ${Object.keys(DEVICE_TOKENS).join(", ")}`);
});
