const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e7, // 👈 50MB limit (Isse Images/Videos par socket disconnect nahi hoga)
  pingTimeout: 60000,
});

// Health check route (Browser mein check karne ke liye)
app.get('/', (req, res) => {
  res.send('ZeroTrace Server v2.0 is Running!');
});

const onlineUsers = new Map();
const registeredPhones = new Set();
const ghostUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 👇 1. Phone register karna aur sabko notify karna (YAHAN ADD HUA HAI)
  socket.on('register_phone', (data) => {
    if (data && data.phone) {
      const cleanPhone = String(data.phone).replace(/\D/g, '').slice(-10);
      registeredPhones.add(cleanPhone);
      onlineUsers.set(cleanPhone, socket.id);
      socket.phone = cleanPhone;
      socket.join(cleanPhone); // Personal room for incoming calls

      // Sabhi phones ko batao ki naya user active hua hai
      io.emit('user_registered', { phone: cleanPhone });
      console.log(`Phone registered: ${cleanPhone}`);
    }
  });

  // 👇 2. Contacts match karke wapas bhejna (YAHAN ADD HUA HAI)
  socket.on('check_registered_contacts', (data, callback) => {
    const numbers = data && Array.isArray(data.numbers) ? data.numbers : [];
    const matched = numbers.filter((num) =>
      registeredPhones.has(String(num).replace(/\D/g, '').slice(-10))
    );
    console.log('Checking contacts, matched:', matched);
    if (typeof callback === 'function') callback(matched);
  });

  // 3. Standard Chat
  socket.on('join_room', (room) => {
    socket.join(room);
  });

socket.on('send_message', (data) => {
    if (data && data.room) {
      // Room mein bhejein
      socket.to(data.room).emit('receive_message', data);
      // Instant delivery ke liye seedha target phone number room mein bhi bhejein
      if (data.targetPhone) {
        socket.to(data.targetPhone).emit('receive_message', data);
      }
    }
  });

  // 4. WebRTC Audio/Video Calling Signaling
  socket.on('call_user', (data) => {
    console.log(`Call from ${data.callerPhone} to ${data.targetPhone}`);
    io.to(data.targetPhone).emit('incoming_call', {
      callerPhone: data.callerPhone,
      callerName: data.callerName,
      type: data.type,
      sdp: data.sdp,
    });
  });

  socket.on('answer_call', (data) => {
    console.log(`Call answered for ${data.targetPhone}`);
    io.to(data.targetPhone).emit('call_answered', {
      sdp: data.sdp,
    });
  });

  socket.on('ice_candidate', (data) => {
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
