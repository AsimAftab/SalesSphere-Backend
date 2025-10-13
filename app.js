const express = require("express");
const connectDB = require("./src/config/config");
const healthcheck = require("express-healthcheck");
const dotenv = require("dotenv");
const morgan = require("morgan");
const authRoutes = require('./src/api/auth/auth.route.js');
const userRoutes = require('./src/api/users/user.route.js');

dotenv.config();

// Connect to the database first
connectDB();

const app = express();

// Middlewares
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/health', healthcheck());
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
// Test Route
app.get("/", (req, res) => {
    res.send("API is running...");
});

module.exports = app;