const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const devices = {};   // deviceId -> socket
const viewers = {};   // deviceId -> Set of sockets

io.on("connection", (socket) => {
  console.log("Socket connected");

  // Pi registers itself
  socket.on("register-device", (deviceId) => {
    devices[deviceId] = socket;
    socket.deviceId = deviceId;
    console.log("Device registered:", deviceId);
  });

  // Browser registers interest in a device
  socket.on("watch-device", (deviceId) => {
  console.log("Viewer watching device:", deviceId);
  if (!viewers[deviceId]) viewers[deviceId] = new Set();
  viewers[deviceId].add(socket);
  socket.watchDevice = deviceId;
});


  // Input from browser → Pi
  socket.on("terminal-input", ({ deviceId, data }) => {
    if (devices[deviceId]) {
      devices[deviceId].emit("terminal-input", data);
    }
  });

  // Output from Pi → all viewers
  socket.on("terminal-output", ({ deviceId, data }) => {
    if (viewers[deviceId]) {
      for (const viewer of viewers[deviceId]) {
        viewer.emit("terminal-output", data);
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

app.get("/", (_, res) => {
  res.send("Pi Relay Running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Relay listening on", PORT);
});
