const express = require('express');
const { getMapLocations } = require('./map.controller');
const { protect } = require('../../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes in this file
router.use(protect);

// Get all map locations for the organization
router.get(
    '/locations',
    getMapLocations
);

module.exports = router;