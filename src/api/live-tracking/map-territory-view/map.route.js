// src/api/live-tracking/map-territory-view/map.route.js
// Map territory view routes - granular feature-based access control

const express = require('express');
const { getMapLocations } = require('./map.controller');
const { protect } = require('../../../middlewares/auth.middleware');
const { checkAccess } = require('../../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
// GET /locations - View map with party, prospect, and site locations
router.get('/locations',
    checkAccess('liveTracking', 'viewLocations'),
    getMapLocations
);

module.exports = router;