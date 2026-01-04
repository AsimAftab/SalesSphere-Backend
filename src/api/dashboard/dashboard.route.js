// src/api/dashboard/dashboard.route.js
// Dashboard routes - permission-based access

const express = require('express');
const { protect, requirePermission } = require('../../middlewares/auth.middleware');
const {
    getDashboardStats,
    getTeamPerformance,
    getAttendanceSummary,
    getSalesTrend
} = require('./dashboard.controller');

const router = express.Router();

router.use(protect);

// All dashboard routes require dashboard.view permission
router.get('/stats', requirePermission('dashboard', 'view'), getDashboardStats);
router.get('/team-performance', requirePermission('dashboard', 'view'), getTeamPerformance);
router.get('/attendance-summary', requirePermission('dashboard', 'view'), getAttendanceSummary);
router.get('/sales-trend', requirePermission('dashboard', 'view'), getSalesTrend);

module.exports = router;