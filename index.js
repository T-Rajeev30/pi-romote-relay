const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ===== CONFIG =====
const RELAY_TOKEN = process.env.RELAY_TOKEN || "piR3m0t3_9f8a2c4d_token";
// ==================

const devices = {};   // deviceId -> socket
const viewers = {};   // deviceId -> Set<sockets>

// ---------- AUTH ----------
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token !== RELAY_TOKEN) {
    return next(new Error("unauthorized"));
  }
  next();
});

// ---------- SOCKET ----------
io.on("connection", (socket) => {
  console.log("Socket connected (authorized)");

  socket.role = "unknown";
  socket.deviceId = null;
  socket.watchDevice = null;

  // ---------- DEVICE REGISTER ----------
  socket.on("register-device", (deviceId) => {
    socket.role = "device";
    socket.deviceId = deviceId;

    // Handle device reboot / reconnect
    if (devices[deviceId]) {
      try {
        devices[deviceId].disconnect(true);
      } catch {}
    }

    devices[deviceId] = socket;
    console.log("Device registered:", deviceId);

    // Notify viewers device is online
    if (viewers[deviceId]) {
      for (const v of viewers[deviceId]) {
        v.emit("device-online", deviceId);
      }
    }
  });

  // ---------- VIEWER WATCH ----------
  socket.on("watch-device", (deviceId) => {
    socket.role = "viewer";
    socket.watchDevice = deviceId;

    if (!viewers[deviceId]) viewers[deviceId] = new Set();
    viewers[deviceId].add(socket);

    console.log("Viewer watching:", deviceId);
  });

  // ---------- TERMINAL INPUT (Browser → Pi) ----------
  socket.on("terminal-input", ({ deviceId, data }) => {
    if (devices[deviceId]) {
      devices[deviceId].emit("terminal-input", data);
    }
  });

  // ---------- TERMINAL OUTPUT (Pi → Browser) ----------
  socket.on("terminal-output", ({ deviceId, data }) => {
    if (viewers[deviceId]) {
      for (const v of viewers[deviceId]) {
        v.emit("terminal-output", { deviceId, data });
      }
    }
  });

  // ---------- STATUS UPDATE (Pi → Dashboard) ----------
  socket.on("STATUS_UPDATE", (payload) => {
    const { deviceId } = payload;

    if (viewers[deviceId]) {
      for (const v of viewers[deviceId]) {
        v.emit("STATUS_UPDATE", payload);
      }
    }
  });

  // ---------- RECORDING CONTROL ----------
  socket.on("START_RECORDING", (payload) => {
    const { deviceId } = payload || {};
    if (devices[deviceId]) {
      devices[deviceId].emit("START_RECORDING", payload);
    }
  });

  socket.on("STOP_RECORDING", ({ deviceId }) => {
    if (devices[deviceId]) {
      devices[deviceId].emit("STOP_RECORDING");
    }
  });
  socket.on("REQUEST_STATUS", (payload) => {
  const { deviceId } = payload;
  if (devices[deviceId]) {
    devices[deviceId].emit("REQUEST_STATUS", payload);
  }
});


  // ---------- DISCONNECT (CRITICAL FIX) ----------
  socket.on("disconnect", () => {
    // Only device socket can mark device offline
    if (socket.role === "device" && socket.deviceId) {
      if (devices[socket.deviceId] === socket) {
        console.log("Device disconnected:", socket.deviceId);
        delete devices[socket.deviceId];

        if (viewers[socket.deviceId]) {
          for (const v of viewers[socket.deviceId]) {
            v.emit("device-offline", socket.deviceId);
          }
        }
      }
    }

    // Viewer cleanup ONLY
    if (socket.role === "viewer" && socket.watchDevice) {
      viewers[socket.watchDevice]?.delete(socket);
    }
  });
});

// ---------- HTTP ----------
app.get("/", (_, res) => {
  res.send("Secure Pi Relay Running");
});

// ---------- START ----------
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Relay listening on", PORT);
});
