const http = require('http');
const { Server } = require('socket.io');
const app = require("./app");
const { initializeTrackingSocket } = require('./src/api/beat-plans/tracking/tracking.socket');

const port = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
// Note: CORS is already handled by Express middleware in app.js
// Socket.IO needs minimal CORS since it upgrades from HTTP requests
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins (Express CORS already validates HTTP requests)
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


