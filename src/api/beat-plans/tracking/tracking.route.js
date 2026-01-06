// src/api/beat-plans/tracking/tracking.route.js
// Beat plan tracking routes - granular feature-based access control

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
const { protect } = require('../../../middlewares/auth.middleware');
const { checkAccess } = require('../../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
// GET /active - View all active tracking sessions
router.get('/active',
    checkAccess('liveTracking', 'viewActiveSessions'),
    getActiveTrackingSessions
);

// GET /:beatPlanId - Get tracking session for a beat plan (view live tracking)
router.get('/:beatPlanId',
    checkAccess('liveTracking', 'viewLiveTracking'),
    getTrackingSession
);

// GET /:beatPlanId/history - Get tracking history for a beat plan
router.get('/:beatPlanId/history',
    checkAccess('liveTracking', 'viewSessionHistory'),
    getTrackingHistory
);

// GET /:beatPlanId/current-location - Get current location for active tracking session
router.get('/:beatPlanId/current-location',
    checkAccess('liveTracking', 'viewCurrentLocation'),
    getCurrentLocation
);

// GET /session/:sessionId/breadcrumbs - Get location breadcrumb trail for tracking session
router.get('/session/:sessionId/breadcrumbs',
    checkAccess('liveTracking', 'viewSessionHistory'),
    getBreadcrumbs
);

// GET /session/:sessionId/summary - Get tracking summary/analytics for a session
router.get('/session/:sessionId/summary',
    checkAccess('liveTracking', 'viewSessionHistory'),
    getTrackingSummary
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /session/:sessionId - Delete tracking session (admin only)
router.delete('/session/:sessionId',
    checkAccess('liveTracking', 'deleteSession'),
    deleteTrackingSession
);

module.exports = router;
