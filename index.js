const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  allowEIO3: true,
  transports: ["polling", "websocket"],
});

const RELAY_TOKEN = process.env.RELAY_TOKEN || "piR3m0t3_9f8a2c4d_token";

const devices = {}; // deviceId → socket
const viewers = {}; // deviceId → Set<socket>

/* ---------- auth ---------- */
io.use((socket, next) => {
  const token = socket.handshake.query?.token || socket.handshake.auth?.token;

  if (token !== RELAY_TOKEN) {
    return next(new Error("unauthorized"));
  }
  next();
});

/* ---------- socket ---------- */
io.on("connection", (socket) => {
  socket.role = "unknown";
  socket.deviceId = null;

  /* ----- device register ----- */
  socket.on("register-device", (deviceId) => {
    socket.role = "device";
    socket.deviceId = deviceId;

    if (devices[deviceId]) {
      devices[deviceId].disconnect(true);
    }

    devices[deviceId] = socket;
    console.log("Device registered:", deviceId);

    viewers[deviceId]?.forEach((v) => v.emit("device-online", deviceId));
  });

  /* ----- viewer watch ----- */
  socket.on("watch-device", (deviceId) => {
    socket.role = "viewer";
    if (!viewers[deviceId]) viewers[deviceId] = new Set();
    viewers[deviceId].add(socket);
    console.log("Viewer watching:", deviceId);
  });

  /* ----- status update ----- */
  socket.on("STATUS_UPDATE", (payload) => {
    const { deviceId } = payload;
    if (viewers[deviceId]) {
      viewers[deviceId].forEach((v) => v.emit("STATUS_UPDATE", payload));
    }
  });

  /* ----- request status ----- */
  socket.on("REQUEST_STATUS", ({ deviceId }) => {
    if (devices[deviceId]) {
      devices[deviceId].emit("REQUEST_STATUS");
    }
  });

  /* ----- recording control ----- */
  socket.on("START_RECORDING", (payload) => {
    devices[payload.deviceId]?.emit("START_RECORDING", payload);
  });

  socket.on("STOP_RECORDING", ({ deviceId }) => {
    devices[deviceId]?.emit("STOP_RECORDING");
  });

  socket.on("LIST_RECORDINGS", ({ deviceId }) => {
    devices[deviceId]?.emit("LIST_RECORDINGS");
  });

  socket.on("RECORDINGS_LIST", (payload) => {
    viewers[payload.deviceId]?.forEach((v) =>
      v.emit("RECORDINGS_LIST", payload),
    );
  });

  /* ----- disconnect ----- */
  socket.on("disconnect", () => {
    if (socket.role === "device" && socket.deviceId) {
      if (devices[socket.deviceId] === socket) {
        delete devices[socket.deviceId];
        viewers[socket.deviceId]?.forEach((v) =>
          v.emit("device-offline", socket.deviceId),
        );
        console.log("Device offline:", socket.deviceId);
      }
    }

    if (socket.role === "viewer") {
      Object.values(viewers).forEach((set) => set.delete(socket));
    }
  });
});

server.listen(process.env.PORT || 10000, () =>
  console.log("Relay listening on 10000"),
);
