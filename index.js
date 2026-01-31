const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const devices = {}; // deviceId -> socket

io.on("connection", (socket) => {
  console.log("Socket connected");

  socket.on("register-device", (deviceId) => {
    devices[deviceId] = socket;
    socket.deviceId = deviceId;
    console.log("Device registered:", deviceId);
  });

  socket.on("terminal-input", ({ deviceId, data }) => {
    if (devices[deviceId]) {
      devices[deviceId].emit("terminal-input", data);
    }
  });

  socket.on("terminal-output", ({ deviceId, data }) => {
    socket.broadcast.emit("terminal-output", { deviceId, data });
  });

  socket.on("disconnect", () => {
    if (socket.deviceId) {
      delete devices[socket.deviceId];
      console.log("Device disconnected:", socket.deviceId);
    }
  });
});

app.get("/", (_, res) => {
  res.send("Pi Relay Running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Relay listening on", PORT);
});
