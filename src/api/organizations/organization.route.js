const express = require('express');
const {
    getMyOrganization,
    updateMyOrganization,
    deactivateOrganization,
    reactivateOrganization
} = require('./organization.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// Get my organization details
router.get('/my-organization', restrictTo('admin', 'manager','superadmin'), getMyOrganization);

// Update organization details (superadmin only)
router.put('/:id', restrictTo('superadmin'), updateMyOrganization);

// Superadmin: Deactivate an organization
router.put('/:id/deactivate', restrictTo('superadmin'), deactivateOrganization);

// Superadmin: Reactivate an organization
router.put('/:id/reactivate', restrictTo('superadmin'), reactivateOrganization);

module.exports = router;
