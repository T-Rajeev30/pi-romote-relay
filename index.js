const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ---------- CONFIG ----------
const RELAY_TOKEN = process.env.RELAY_TOKEN || "piR3m0t3_9f8a2c4d_token";
// ----------------------------

// 🔴 SEPARATE STORAGE (IMPORTANT)
const deviceSockets = {}; // deviceId -> socket
const viewers = {}; // deviceId -> Set<sockets>

// ---------- AUTH ----------
io.use((socket, next) => {
  if (socket.handshake.auth?.token !== RELAY_TOKEN) {
    return next(new Error("unauthorized"));
  }
  next();
});

// ---------- SOCKET ----------
io.on("connection", (socket) => {
  socket.role = "unknown";
  socket.deviceId = null;
  socket.watchDevice = null;

  console.log("Socket connected");

  // ----- DEVICE REGISTER -----
  socket.on("register-device", (deviceId) => {
    socket.role = "device";
    socket.deviceId = deviceId;

    if (deviceSockets[deviceId]) {
      try {
        deviceSockets[deviceId].disconnect(true);
      } catch {}
    }

    deviceSockets[deviceId] = socket;
    console.log("Device registered:", deviceId);

    if (viewers[deviceId]) {
      viewers[deviceId].forEach((v) => v.emit("device-online", deviceId));
    }
  });

  // ----- VIEWER WATCH -----
  socket.on("watch-device", (deviceId) => {
    socket.role = "viewer";
    socket.watchDevice = deviceId;

    if (!viewers[deviceId]) viewers[deviceId] = new Set();
    viewers[deviceId].add(socket);

    console.log("Viewer watching:", deviceId);
  });

  // ----- STATUS UPDATE -----
  socket.on("STATUS_UPDATE", (payload) => {
    const { deviceId } = payload;
    viewers[deviceId]?.forEach((v) => v.emit("STATUS_UPDATE", payload));
  });

  // ----- REQUEST STATUS -----
  socket.on("REQUEST_STATUS", ({ deviceId }) => {
    deviceSockets[deviceId]?.emit("REQUEST_STATUS");
  });

  // ----- RECORDING CONTROL -----
  socket.on("START_RECORDING", (payload) => {
    deviceSockets[payload.deviceId]?.emit("START_RECORDING", payload);
  });

  socket.on("STOP_RECORDING", ({ deviceId }) => {
    deviceSockets[deviceId]?.emit("STOP_RECORDING");
  });

  // ----- RECORDINGS LIST -----
  socket.on("RECORDINGS_LIST", (payload) => {
    viewers[payload.deviceId]?.forEach((v) =>
      v.emit("RECORDINGS_LIST", payload),
    );
  });

  // ----- DISCONNECT -----
  socket.on("disconnect", () => {
    if (socket.role === "device" && socket.deviceId) {
      if (deviceSockets[socket.deviceId] === socket) {
        delete deviceSockets[socket.deviceId];
        viewers[socket.deviceId]?.forEach((v) =>
          v.emit("device-offline", socket.deviceId),
        );
        console.log("Device offline:", socket.deviceId);
      }
    }

    if (socket.role === "viewer" && socket.watchDevice) {
      viewers[socket.watchDevice]?.delete(socket);
    }
  });
});

// ---------- HTTP ----------
app.get("/", (_, res) => res.send("Secure Pi Relay Running"));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Relay listening on", PORT));
