const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Phone number -> socket.id map
const onlineUsers = new Map();
const registeredPhones = new Set();
const ghostUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. Register Phone & Personal Room
  socket.on('register_phone', (data) => {
    if (data && data.phone) {
      registeredPhones.add(data.phone);
      onlineUsers.set(data.phone, socket.id);
      socket.phone = data.phone;
      socket.join(data.phone); // Personal room for incoming calls
      console.log(`Phone registered: ${data.phone}`);
    }
  });

  // 2. Check Contacts Matching
  socket.on('check_registered_contacts', (data, callback) => {
    const numbers = data && Array.isArray(data.numbers) ? data.numbers : [];
    const matched = numbers.filter((num) => registeredPhones.has(num));
    if (typeof callback === 'function') callback(matched);
  });

  // 3. Standard Chat
  socket.on('join_room', (room) => {
    socket.join(room);
  });

  socket.on('send_message', (data) => {
    if (data && data.room) {
      socket.to(data.room).emit('receive_message', data);
    }
  });

  // 4. WebRTC Signaling (Direct User-to-User via Phone Number)
  socket.on('call_user', (data) => {
    // data: { targetPhone, callerPhone, callerName, type, sdp }
    console.log(`Call from ${data.callerPhone} to ${data.targetPhone}`);
    io.to(data.targetPhone).emit('incoming_call', {
      callerPhone: data.callerPhone,
      callerName: data.callerName,
      type: data.type,
      sdp: data.sdp,
    });
  });

  socket.on('answer_call', (data) => {
    // data: { targetPhone, sdp }
    console.log(`Call answered for ${data.targetPhone}`);
    io.to(data.targetPhone).emit('call_answered', {
      sdp: data.sdp,
    });
  });

  socket.on('ice_candidate', (data) => {
    // data: { targetPhone, candidate }
    if (data && data.targetPhone && data.candidate) {
      io.to(data.targetPhone).emit('ice_candidate', {
        candidate: data.candidate,
      });
    }
  });

  socket.on('end_call', (data) => {
    if (data && data.targetPhone) {
      io.to(data.targetPhone).emit('call_ended');
    }
  });

  // 5. Ghost Mode Signaling
  socket.on('register_ghost_id', (ghostId) => {
    ghostUsers.set(ghostId, socket.id);
    socket.ghostId = ghostId;
  });

  socket.on('send_ghost_payload', (data) => {
    const targetSocketId = ghostUsers.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_ghost_payload', data);
    } else {
      socket.emit('receive_ghost_payload', { type: 'USER_OFFLINE', sender: data.targetId });
    }
  });

  socket.on('disconnect', () => {
    if (socket.phone) onlineUsers.delete(socket.phone);
    if (socket.ghostId) ghostUsers.delete(socket.ghostId);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ZeroTrace Server running on port ${PORT}`);
});
