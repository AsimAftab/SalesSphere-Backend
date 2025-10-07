const express = require("express");
const connectDB = require("./src/config/config");
const healthcheck = require("express-healthcheck");
const dotenv = require("dotenv");
const morgan = require("morgan"); // 1. Import morgan

dotenv.config();

const app = express();

// Middlewares
app.use(express.json());
app.use(morgan('dev')); // 2. Use morgan in 'dev' mode

// Healthcheck Route
app.use('/health', healthcheck());

// Connect to the database
connectDB();

// Test Route
app.get("/", (req, res) => {
    res.send("API is running...");
});
 
module.exports = app;