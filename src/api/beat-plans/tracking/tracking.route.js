// src/api/beat-plans/tracking/tracking.route.js
// Beat plan tracking routes - permission-based access

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
const { protect, requirePermission } = require('../../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/active', requirePermission('liveTracking', 'view'), getActiveTrackingSessions);
router.get('/:beatPlanId', requirePermission('liveTracking', 'view'), getTrackingSession);
router.get('/:beatPlanId/history', requirePermission('liveTracking', 'view'), getTrackingHistory);
router.get('/:beatPlanId/current-location', requirePermission('liveTracking', 'view'), getCurrentLocation);
router.get('/session/:sessionId/breadcrumbs', requirePermission('liveTracking', 'view'), getBreadcrumbs);
router.get('/session/:sessionId/summary', requirePermission('liveTracking', 'view'), getTrackingSummary);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/session/:sessionId', requirePermission('liveTracking', 'delete'), deleteTrackingSession);

module.exports = router;
