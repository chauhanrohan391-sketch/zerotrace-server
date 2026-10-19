const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const twilio = require('twilio');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Twilio Client Setup (Render environment variables se credentials uthayega)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const otpStore = {}; // phone -> { otp, expires }

const registeredUsers = {}; // phone -> { email, socketId }
const ghostUsers = {};      // ghostId -> socketId

io.on('connection', (socket) => {
  // 1. Real OTP Request via Twilio
  socket.on('request_real_otp', async ({ phone, email }, callback) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 }; // 5 minutes expiry
    
    try {
      await twilioClient.messages.create({
        body: `Your ZeroTrace verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+91${phone}`, // India ke liye +91 prefix
      });
      console.log(`OTP sent successfully to ${phone}`);
      if (callback) callback({ success: true, message: 'OTP sent via SMS!' });
    } catch (error) {
      console.error('Twilio SMS Error:', error);
      if (callback) callback({ success: false, message: 'Failed to send SMS via Twilio.' });
    }
  });

  // 2. Real OTP Verification Handler
  socket.on('verify_real_otp', ({ phone, otp, email }, callback) => {
    const rec = otpStore[phone];
    if (rec && rec.otp === otp && rec.expires > Date.now()) {
      delete otpStore[phone];
      registeredUsers[phone] = { email: email || 'user@zerotrace.com', socketId: socket.id };
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, message: 'Invalid or expired OTP.' });
    }
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
  socket.on('send_message', (data) => socket.to(data.room).emit('receive_message', data));

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
