const app = require("./app");

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});


// const app = require("./app");
// const connectDB = require("./src/config/config"); // Assuming this exports your DB connection

// const port = process.env.PORT || 5000;

// // Start the server
// const server = app.listen(port, () => {
//   console.log(`✅ Server running on http://localhost:${port}`);
// });

// // Graceful shutdown handling
// process.on("SIGTERM", () => {
//   console.log("⚠️ SIGTERM signal received: closing HTTP server...");

//   server.close(async () => {
//     console.log("🛑 HTTP server closed.");

//     // Optional: close MongoDB connection if you’re using Mongoose
//     try {
//       const mongoose = require("mongoose");
//       await mongoose.connection.close(false);
//       console.log("📦 MongoDB connection closed.");
//     } catch (err) {
//       console.error("Error closing MongoDB connection:", err);
//     }

//     process.exit(0);
//   });
// });

// // Optional: handle Ctrl+C in local development
// process.on("SIGINT", () => {
//   console.log("🧹 SIGINT signal received (Ctrl+C): shutting down gracefully...");
//   server.close(async () => {
//     console.log("🛑 HTTP server closed.");
//     try {
//       const mongoose = require("mongoose");
//       await mongoose.connection.close(false);
//       console.log("📦 MongoDB connection closed.");
//     } catch (err) {
//       console.error("Error closing MongoDB connection:", err);
//     }
//     process.exit(0);
//   });
// });
