// src/api/live-tracking/map-territory-view/map.route.js
// Live tracking map routes - permission-based access

const express = require('express');
const { getMapLocations } = require('./map.controller');
const { protect, requirePermission } = require('../../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/locations', requirePermission('liveTracking', 'view'), getMapLocations);

module.exports = router;