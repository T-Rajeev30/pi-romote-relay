const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ===== CONFIG =====
const RELAY_TOKEN = process.env.RELAY_TOKEN || "piR3m0t3_9f8a2c4d_token";
// ==================

const devices = {};   // deviceId -> socket
const viewers = {};   // deviceId -> Set<sockets>

// --- AUTH GUARD ---
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token !== RELAY_TOKEN) {
    return next(new Error("unauthorized"));
  }
  next();
});

io.on("connection", (socket) => {
  console.log("Socket connected (authorized)");

  socket.on("register-device", (deviceId) => {
    devices[deviceId] = socket;
    socket.deviceId = deviceId;
    console.log("Device registered:", deviceId);
  });

  socket.on("watch-device", (deviceId) => {
    if (!viewers[deviceId]) viewers[deviceId] = new Set();
    viewers[deviceId].add(socket);
    socket.watchDevice = deviceId;
    console.log("Viewer watching:", deviceId);
  });

  socket.on("terminal-input", ({ deviceId, data }) => {
    if (devices[deviceId]) {
      devices[deviceId].emit("terminal-input", data);
    }
  });

  socket.on("terminal-output", ({ deviceId, data }) => {
  if (viewers[deviceId]) {
    for (const viewer of viewers[deviceId]) {
      viewer.emit("terminal-output", { deviceId, data });
    }
  }
});


  socket.on("disconnect", () => {
    if (socket.deviceId) delete devices[socket.deviceId];
    if (socket.watchDevice && viewers[socket.watchDevice]) {
      viewers[socket.watchDevice].delete(socket);
    }
  });
});

app.get("/", (_, res) => res.send("Secure Pi Relay Running"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Relay listening on", PORT));
