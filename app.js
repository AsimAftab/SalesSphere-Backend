const express = require("express");
const compression = require('compression')
const connectDB = require("./src/config/config");
const healthcheck = require("express-healthcheck");
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const dotenv = require("dotenv");
const morgan = require("morgan");
const authRoutes = require('./src/api/auth/auth.route.js');
const userRoutes = require('./src/api/users/user.route.js');
const dashboardRoutes = require('./src/api/dashboard/dashboard.route.js');
const productRoutes = require('./src/api/product/product.routes.js');
const partiesRoutes = require('./src/api/parties/party.routes.js')
const prospectsRoutes = require('./src/api/prospect/prospect.route.js')
const sitesRoutes = require('./src/api/sites/sites.route.js')

dotenv.config();

// Connect to the database first
connectDB();

const app = express();
app.set('trust proxy', 1);
// --- Middlewares ---

// CORS Configuration
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'https://salessphere360.com',
    'https://www.salessphere360.com'
  ],
  optionsSuccessStatus: 200,
  credentials: true, // if you ever use cookies / auth headers
};
app.use(cors(corsOptions));

app.use(compression({
  threshold: 1024, // only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false; // allow clients to disable it
    return compression.filter(req, res);
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
});

app.use(morgan('dev'));
app.use(express.json());

// --- Routes ---
app.use('/health', healthcheck());
app.use('/api/v1/auth',authLimiter,  authRoutes);
app.use('/api/v1/users',authLimiter, userRoutes);
app.use('/api/v1/dashboard', authLimiter, dashboardRoutes);
app.use('/api/v1/products',authLimiter,productRoutes);
app.use('/api/v1/parties',authLimiter,partiesRoutes);
app.use('/api/v1/prospects',authLimiter,prospectsRoutes);
app.use('/api/v1/sites',authLimiter,sitesRoutes);


// Test Route
app.get("/", (req, res) => {
    res.send("API is running...");
});

module.exports = app;

