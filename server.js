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
    // Allow mobile apps and web clients
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://salessphere360.com',
        'https://www.salessphere360.com'
      ];

      // Allow all origins in development, or whitelisted origins in production
      if (process.env.NODE_ENV === 'local_development' || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
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


