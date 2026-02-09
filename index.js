const http = require("http");
const WebSocket = require("ws");

/* ================= CONFIG ================= */

const DEVICE_TOKENS = JSON.parse(process.env.DEVICE_TOKENS || "{}");
const PORT = process.env.PORT || 10000;

/* ================= SERVER ================= */

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Relay alive");
});

const wss = new WebSocket.Server({
  server,
  maxPayload: 1024 * 1024,
});

/* ================= STATE ================= */

const devices = new Map(); // deviceId → ws
const clients = new Set(); // dashboard / backend clients

/* ================= UTILS ================= */

function safeSend(ws, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(data));
  } catch (e) {
    console.error("Send error:", e.message);
  }
}

/* ================= HEARTBEAT ================= */

function heartbeat() {
  this.isAlive = true;
}

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

/* ================= CONNECTION ================= */

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

    /* ---------- PI REGISTER ---------- */
    if (msg.type === "register") {
      if (DEVICE_TOKENS[msg.deviceId] !== msg.token) {
        console.log("Auth failed for:", msg.deviceId);
        return ws.close();
      }

      const old = devices.get(msg.deviceId);
      if (old) {
        console.log("Replacing old Pi connection:", msg.deviceId);
        old.terminate();
      }

      ws.role = "pi";
      ws.deviceId = msg.deviceId;
      devices.set(msg.deviceId, ws);

      console.log("Pi authenticated:", msg.deviceId);
      safeSend(ws, { type: "registered", deviceId: msg.deviceId });
      return;
    }

    /* ---------- CLIENT ATTACH ---------- */
    if (msg.type === "attach") {
      const pi = devices.get(msg.deviceId);
      if (!pi) {
        safeSend(ws, { type: "error", message: "Pi not online" });
        return;
      }

      ws.role = "client";
      ws.deviceId = msg.deviceId;
      clients.add(ws);

      safeSend(ws, { type: "attached", deviceId: msg.deviceId });
      console.log("Client attached:", msg.deviceId);
      return;
    }

    /* ---------- CLIENT RELEASE ---------- */
    if (msg.type === "release") {
      clients.delete(ws);
      ws.deviceId = null;
      console.log("Client released Pi");
      return;
    }

    /* ---------- COMMAND → PI ---------- */
    if (msg.type === "command") {
      const pi = devices.get(msg.deviceId);
      if (!pi) {
        console.log("Command target Pi not found:", msg.deviceId);
        return;
      }

      safeSend(pi, msg);
      console.log("Command forwarded to Pi:", msg.action, "→", msg.deviceId);
      return;
    }

    /* ---------- TERMINAL INPUT ---------- */
    if (msg.type === "input") {
      const pi = devices.get(ws.deviceId);
      if (pi) safeSend(pi, msg);
      return;
    }

    if (msg.type === "resize") {
      const pi = devices.get(ws.deviceId);
      if (pi) safeSend(pi, msg);
      return;
    }

    /* ---------- PI OUTPUT / EVENTS ---------- */
    if (
      ws.role === "pi" &&
      (msg.type === "output" ||
        msg.type === "recording_complete" ||
        msg.type === "upload_progress")
    ) {
      clients.forEach((client) => {
        if (client.deviceId === ws.deviceId) {
          safeSend(client, msg);
        }
      });
      return;
    }
  });

  ws.on("close", () => {
    if (ws.role === "pi") {
      devices.delete(ws.deviceId);
      console.log("Pi disconnected:", ws.deviceId);
    }

    if (ws.role === "client") {
      clients.delete(ws);
      console.log("Client disconnected");
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

/* ================= SHUTDOWN ================= */

function shutdown() {
  console.log("Shutting down relay...");
  clearInterval(heartbeatInterval);

  wss.clients.forEach((ws) => ws.close());
  server.close(() => process.exit(0));

  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/* ================= START ================= */

server.listen(PORT, () => {
  console.log(`Relay listening on port ${PORT}`);
  console.log(
    `Registered devices: ${Object.keys(DEVICE_TOKENS).join(", ") || "none"}`,
  );
});
