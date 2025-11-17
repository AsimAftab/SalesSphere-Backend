const express = require('express');
const {
    getTrackingSession,
    getTrackingHistory,
    getBreadcrumbs,
    getCurrentLocation,
    getTrackingSummary,
    getActiveTrackingSessions,
    deleteTrackingSession,
} = require('./tracking.controller');
const { protect, restrictTo } = require('../../../middlewares/auth.middleware');

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Get all active tracking sessions (Admin, Manager only)
router.get('/active', restrictTo('admin', 'manager', 'superadmin'), getActiveTrackingSessions);

// Get current tracking session for a beat plan
router.get('/:beatPlanId', getTrackingSession);

// Get tracking history for a beat plan
router.get('/:beatPlanId/history', getTrackingHistory);

// Get current location for an active tracking session
router.get('/:beatPlanId/current-location', getCurrentLocation);

// Get breadcrumb trail for a specific session
router.get('/session/:sessionId/breadcrumbs', getBreadcrumbs);

// Get tracking summary for a specific session
router.get('/session/:sessionId/summary', getTrackingSummary);

// Delete tracking session (Admin only)
router.delete('/session/:sessionId', restrictTo('admin', 'superadmin'), deleteTrackingSession);

module.exports = router;
