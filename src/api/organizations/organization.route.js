const express = require('express');
const {
    getMyOrganization,
    getOrganizationById,
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

// Get specific organization details by ID (superadmin only)
router.get('/:id', restrictTo('superadmin','superadmin'), getOrganizationById);

// Update organization details (superadmin only)
router.put('/:id', restrictTo('superadmin','developer'), updateMyOrganization);

// Superadmin: Deactivate an organization
router.put('/:id/deactivate', restrictTo('superadmin','developer'), deactivateOrganization);

// Superadmin: Reactivate an organization
router.put('/:id/reactivate', restrictTo('superadmin','developer'), reactivateOrganization);

module.exports = router;
