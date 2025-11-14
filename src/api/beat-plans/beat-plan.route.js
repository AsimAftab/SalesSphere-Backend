const express = require('express');
const {
    getSalespersons,
    getAvailableParties,
    getBeatPlanData,
    createBeatPlan,
    getAllBeatPlans,
    getBeatPlanById,
    updateBeatPlan,
    deleteBeatPlan,
    markPartyVisited,
    getMyBeatPlans,
    startBeatPlan,
    getBeatPlanDetails,
    calculateDistanceToParty,
    optimizeBeatPlanRoute
} = require('./beat-plan.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes in this file
router.use(protect);

// Get salespersons for employee dropdown - Available to Admin and Manager
router.get(
    '/salesperson',
    restrictTo('admin', 'manager'),
    getSalespersons
);

// Get available parties for beat plan assignment - Available to Admin and Manager
router.get(
    '/available-parties',
    restrictTo('admin', 'manager'),
    getAvailableParties
);

// Get beat plan data/analytics - Available to Admin and Manager
router.get(
    '/data',
    restrictTo('admin', 'manager'),
    getBeatPlanData
);

// Get salesperson's assigned beat plans - Available to salesperson (MUST come before /:id)
router.get(
    '/my-beatplans',
    getMyBeatPlans
);

// Calculate distance from current location to a party - Available to all authenticated users
router.post(
    '/calculate-distance',
    calculateDistanceToParty
);

// Create a beat plan - Admin and Manager
router.post(
    '/',
    restrictTo('admin', 'manager'),
    createBeatPlan
);

// Get all beat plans (list view) - Available to all roles
router.get(
    '/',
    getAllBeatPlans
);

// Get detailed beatplan information with all parties and visit status (MUST come before /:id)
router.get(
    '/:id/details',
    getBeatPlanDetails
);

// Optimize beatplan route using nearest neighbor algorithm (MUST come before /:id)
router.post(
    '/:id/optimize-route',
    optimizeBeatPlanRoute
);

// Start a beat plan (activate) - Salesperson assigned to the beat plan (MUST come before /:id)
router.post(
    '/:id/start',
    startBeatPlan
);

// Mark a party as visited in beat plan - Salesperson can mark visits (MUST come before /:id)
router.post(
    '/:id/visit',
    markPartyVisited
);

// Update a beat plan - Admin and Manager
router.put(
    '/:id',
    restrictTo('admin', 'manager'),
    updateBeatPlan
);

// Delete a beat plan - Admin and Manager
router.delete(
    '/:id',
    restrictTo('admin', 'manager'),
    deleteBeatPlan
);

// Get single beat plan (detail view) - Available to all roles (MUST come LAST)
router.get(
    '/:id',
    getBeatPlanById
);

module.exports = router;
