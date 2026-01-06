// src/api/dashboard/dashboard.route.js
// Dashboard routes - granular feature-based access control

const express = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess } = require('../../middlewares/compositeAccess.middleware');
const {
    getDashboardStats,
    getTeamPerformance,
    getAttendanceSummary,
    getSalesTrend
} = require('./dashboard.controller');

const router = express.Router();

router.use(protect);

// GET /stats - View high-level business metrics and overview cards
// Returns: totalPartiesToday, totalSalesToday, totalOrdersToday, pendingOrders
router.get('/stats',
    checkAccess('dashboard', 'viewStats'),
    getDashboardStats
);

// GET /team-performance - View real-time team performance metrics for today
// Returns: Team sales/orders data for today
router.get('/team-performance',
    checkAccess('dashboard', 'viewTeamPerformance'),
    getTeamPerformance
);

// GET /attendance-summary - View daily attendance overview across the organization
// Returns: teamStrength, present, absent, onLeave, halfDay, weeklyOff, attendanceRate
router.get('/attendance-summary',
    checkAccess('dashboard', 'viewAttendanceSummary'),
    getAttendanceSummary
);

// GET /sales-trend - View sales revenue and growth trends for the last 7 days
// Returns: Sales data for last 7 days
router.get('/sales-trend',
    checkAccess('dashboard', 'viewSalesTrend'),
    getSalesTrend
);

module.exports = router;
