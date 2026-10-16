const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Increased size limit (10MB) so encrypted photos can pass through
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7, 
});

io.on("connection", (socket) => {
  console.log("A user connected! ID:", socket.id);

  socket.on("join_room", (room) => {
    socket.join(room);
    console.log(`User joined room: ${room}`);
  });

  socket.on("chat_message", (msg) => {
console.log(`[Room: ${msg.room}] ${msg.username}: ${msg.text.substring(0, 60)}... (Size: ${msg.text.length} bytes)`);
    socket.to(msg.room).emit("receive_message", msg);
  });
  socket.on("burn_room", (room) => {
    console.log(`🔥 Room burned: ${room}`);
    socket.to(room).emit("room_burned");
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("ZeroTrace Server running on port 3000");
});