const http = require('http');
const { Server } = require('socket.io');
const app = require("./app");
const { initializeTrackingSocket } = require('./src/api/beat-plans/tracking/tracking.socket');

const port = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://salessphere360.com',
      'https://www.salessphere360.com'
    ],
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Initialize beat plan tracking WebSocket
initializeTrackingSocket(io);

// Start server
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📡 WebSocket server ready`);
});


