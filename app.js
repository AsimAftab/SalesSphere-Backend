const express = require("express");
const helmet = require("helmet");
const compression = require('compression')
const connectDB = require("./src/config/config");
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const dotenv = require("dotenv");
const morgan = require("morgan");
const authRoutes = require('./src/api/auth/auth.route.js');
const userRoutes = require('./src/api/users/user.route.js');
const dashboardRoutes = require('./src/api/dashboard/dashboard.route.js');
const partiesRoutes = require('./src/api/parties/party.routes.js')
const prospectsRoutes = require('./src/api/prospect/prospect.route.js')
const categoryRoutes = require('./src/api/product/category/category.routes.js')
const productRoutes = require('./src/api/product/product.routes.js');
const sitesRoutes = require('./src/api/sites/sites.route.js')
const invoicesRoutes = require('./src/api/invoice/invoice.route.js')
const attendanceRoutes = require('./src/api/attendance/attendance.route.js');
const organizationRoutes = require('./src/api/organizations/organization.route.js');
const territoryMapRoutes = require('./src/api/live-tracking/map-territory-view/map.route.js');


dotenv.config();

// Connect to the database first
connectDB();

const app = express();
app.set('trust proxy', 1);

// --- Security Middlewares ---

// Helmet: Sets various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: false, // Disable if you need to load external resources
  crossOriginEmbedderPolicy: false, // Needed for some CDN/external resources
}));

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
  max: 10000, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
});

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser()); // Parse cookies from requests

// --- CSRF Protection (Modern Implementation) ---
const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'your-csrf-secret-key-change-in-production',
  cookieName: process.env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // lax for dev, strict for prod
    path: '/',
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req) => req.session?.id || '', // Required for session-based CSRF
});

// Conditionally apply CSRF protection
app.use((req, res, next) => {
  const isMobileClient = req.headers['x-client-type'] === 'mobile';
  
  if (isMobileClient) {
    // Skip CSRF for mobile clients using Bearer tokens
    return next();
  }
  
  // Apply CSRF protection for web clients
  doubleCsrfProtection(req, res, (err) => {
    if (err) {
      // Add more context to CSRF errors
      err.isCsrfError = true;
      return next(err);
    }
    next();
  });
});

// --- Advanced Health Check ---
app.get('/health', async (req, res) => {
    const healthcheck = {
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            api: 'operational',
            database: 'operational'
        },
        memory: {
            rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
            heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
        }
    };

    try {
        // Check database connection without exposing details
        if (mongoose.connection.readyState !== 1) {
            healthcheck.status = 'DEGRADED';
            healthcheck.services.database = 'unavailable';
            return res.status(503).json(healthcheck);
        }

        res.status(200).json(healthcheck);
    } catch (error) {
        healthcheck.status = 'ERROR';
        healthcheck.services.api = 'error';
        res.status(503).json(healthcheck);
    }
});

// --- CSRF Token Endpoint for Web Clients ---
app.get('/api/v1/csrf-token', (req, res) => {
    // This endpoint provides CSRF token to web clients
    // Mobile clients don't need this as they use Bearer tokens
    const csrfToken = generateCsrfToken(req, res);
    res.json({ csrfToken });
});

// --- Routes ---
app.use('/api/v1/auth',authLimiter,  authRoutes);
app.use('/api/v1/users',authLimiter, userRoutes);
app.use('/api/v1/dashboard', authLimiter, dashboardRoutes);
app.use('/api/v1/products',authLimiter,productRoutes);
app.use('/api/v1/parties',authLimiter,partiesRoutes);
app.use('/api/v1/prospects',authLimiter,prospectsRoutes);
app.use('/api/v1/sites',authLimiter,sitesRoutes);
app.use('/api/v1/categories', authLimiter, categoryRoutes);
app.use('/api/v1/products', authLimiter, productRoutes);
app.use('/api/v1/invoices', authLimiter, invoicesRoutes);
app.use('/api/v1/attendance', authLimiter, attendanceRoutes);
app.use('/api/v1/organizations', authLimiter, organizationRoutes);
app.use('/api/v1/map', authLimiter, territoryMapRoutes);


// Test Route
app.get("/", (req, res) => {
    res.send("API is running...");
});

// --- Error Handlers (Must be after all routes) ---

// CSRF Error Handler
app.use((err, req, res, next) => {
    // Check if it's a CSRF error
    if (err.code === 'EBADCSRFTOKEN' || err.isCsrfError || err.message?.toLowerCase().includes('csrf')) {
        console.warn('⚠️  CSRF validation failed:', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            userAgent: req.get('user-agent')
        });

        return res.status(403).json({
            status: 'error',
            message: 'Invalid or missing CSRF token. Please refresh the page and try again.'
        });
    }
    next(err);
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            status: 'error',
            message: 'Validation Error',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid ID format'
        });
    }

    if (err.code === 11000) {
        return res.status(409).json({
            status: 'error',
            message: 'Duplicate field value entered'
        });
    }

    // Default error response
    res.status(err.statusCode || 500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

module.exports = app;

