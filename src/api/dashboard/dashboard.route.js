const express = require('express');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const { 
    getDashboardStats, 
    getTeamPerformance, 
    getAttendanceSummary,
    getSalesTrend
} = require('./dashboard.controller');

const router = express.Router();

// All dashboard routes are protected
router.use(protect, restrictTo('admin', 'manager'));

router.get('/stats', getDashboardStats);
router.get('/team-performance', getTeamPerformance); 
router.get('/attendance-summary', getAttendanceSummary); 
router.get('/sales-trend', getSalesTrend); 

module.exports = router;