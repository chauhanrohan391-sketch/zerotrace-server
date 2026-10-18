const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7
});

const registeredUsers = {}; // phone -> { email, socketId }
const ghostUsers = {};      // ghostId -> socketId

io.on('connection', (socket) => {
  console.log("A user connected! ID:", socket.id);

  // 1. Bypass Real OTP & Always Succeed for Testing
  socket.on('request_real_otp', ({ phone, email }, callback) => {
    if (callback) callback({ success: true, message: 'Test mode: OTP ready!' });
  });

  // 2. Accept Any OTP for Verification
  socket.on('verify_real_otp', ({ phone, otp }, callback) => {
    registeredUsers[phone] = { email: 'test@zerotrace.com', socketId: socket.id };
    if (callback) callback({ success: true });
  });

  // 3. Re-connect existing verified user
  socket.on('register_phone', ({ phone, email }) => {
    registeredUsers[phone] = { email, socketId: socket.id };
  });

  // 4. Match Phone Contacts
  socket.on('check_contacts', (contactNumbers, callback) => {
    const matched = contactNumbers.filter((num) => Boolean(registeredUsers[num]));
    if (callback) callback(matched);
  });

  // 5. Standard Chat Routing
  socket.on('join_room', (room) => socket.join(room));
  
  socket.on('chat_message', (msg) => {
    socket.to(msg.room).emit('receive_message', msg);
  });

  // 6. Ghost Mode Routing
  socket.on('register_ghost_id', (ghostId) => {
    ghostUsers[ghostId] = socket.id;
  });

  socket.on('send_ghost_payload', (data) => {
    const targetSocketId = ghostUsers[data.targetId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_ghost_payload', data);
    } else {
      io.to(socket.id).emit('receive_ghost_payload', {
        type: 'USER_OFFLINE',
        sender: data.targetId,
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
