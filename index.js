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

// deviceId → ws
const devices = new Map();

// ws → deviceId (for clients)
const clients = new Map();

/* ================= UTILS ================= */

function safeSend(ws, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(data));
}

/* ================= CONNECTION ================= */

wss.on("connection", (ws) => {
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    /* =================================================
       DEVICE REGISTRATION
    ================================================= */

    if (msg.type === "register") {
      const { deviceId, token } = msg;

      if (!DEVICE_TOKENS[deviceId] || DEVICE_TOKENS[deviceId] !== token) {
        console.log("Auth failed for:", deviceId);
        return ws.close();
      }

      const old = devices.get(deviceId);
      if (old) old.terminate();

      ws.role = "device";
      ws.deviceId = deviceId;

      devices.set(deviceId, ws);

      console.log("Device registered:", deviceId);

      safeSend(ws, { type: "registered", deviceId });
      return;
    }

    /* =================================================
       BACKEND ATTACH TO DEVICE
    ================================================= */

    if (msg.type === "attach") {
      const { deviceId } = msg;

      const device = devices.get(deviceId);

      if (!device) {
        safeSend(ws, { type: "error", message: "Pi not online" });
        return;
      }

      ws.role = "client";
      ws.deviceId = deviceId;

      clients.set(ws, deviceId);

      console.log("Client attached to:", deviceId);

      safeSend(ws, { type: "attached", deviceId });
      return;
    }

    /* =================================================
       COMMAND FROM BACKEND → DEVICE
    ================================================= */

    if (msg.type === "command") {
      const { deviceId } = msg;

      const device = devices.get(deviceId);

      if (!device) {
        safeSend(ws, { type: "error", message: "Pi not online" });
        return;
      }

      safeSend(device, msg);

      console.log("Command forwarded:", msg.action, "→", deviceId);
      return;
    }

    /* =================================================
       DEVICE EVENTS → BACKEND
    ================================================= */

    if (
      ws.role === "device" &&
      (msg.type === "heartbeat" ||
        msg.type === "recording_complete" ||
        msg.type === "upload_progress")
    ) {
      for (const [clientWs, attachedDeviceId] of clients.entries()) {
        if (attachedDeviceId === ws.deviceId) {
          safeSend(clientWs, msg);
        }
      }

      return;
    }
  });

  ws.on("close", () => {
    if (ws.role === "device") {
      devices.delete(ws.deviceId);
      console.log("Device disconnected:", ws.deviceId);
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

/* ================= HEARTBEAT CHECK ================= */

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/* ================= START ================= */

server.listen(PORT, () => {
  console.log("Relay listening on port", PORT);
  console.log(
    "Registered devices:",
    Object.keys(DEVICE_TOKENS).join(", ") || "none",
  );
});
