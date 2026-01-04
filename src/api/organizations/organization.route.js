// src/api/organizations/organization.route.js
// Organization management routes - migrated to permission-based access

const express = require('express');
const {
    getMyOrganization,
    getOrganizationById,
    updateMyOrganization,
    deactivateOrganization,
    reactivateOrganization,
    extendSubscription
} = require('./organization.controller');
const {
    protect,
    requirePermission,
    requireSystemRole
} = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// ============================================
// ORGANIZATION ROUTES
// ============================================

// Get my organization details - requires read permission on organizations
router.get('/my-organization', requirePermission('organizations', 'read'), getMyOrganization);

// ============================================
// SYSTEM ROUTES (superadmin/developer only)
// ============================================

// Get specific organization details by ID
router.get('/:id', requireSystemRole(), getOrganizationById);

// Update organization details
router.put('/:id', requireSystemRole(), updateMyOrganization);

// Deactivate an organization
router.put('/:id/deactivate', requireSystemRole(), deactivateOrganization);

// Reactivate an organization
router.put('/:id/reactivate', requireSystemRole(), reactivateOrganization);

// Extend organization subscription
router.post('/:id/extend-subscription', requireSystemRole(), extendSubscription);

module.exports = router;
