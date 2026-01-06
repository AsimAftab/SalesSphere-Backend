// src/api/organizations/organization.route.js
// Organization management routes - permission-based access

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

router.use(protect);

// Get my organization - any authenticated org member can view
router.get('/my-organization', getMyOrganization);

// System routes (superadmin/developer only)
router.get('/:id', requireSystemRole(), getOrganizationById);
router.put('/:id', requireSystemRole(), updateMyOrganization);
router.put('/:id/deactivate', requireSystemRole(), deactivateOrganization);
router.put('/:id/reactivate', requireSystemRole(), reactivateOrganization);
router.post('/:id/extend-subscription', requireSystemRole(), extendSubscription);

module.exports = router;
