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
    markPartyVisited
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

// Get single beat plan (detail view) - Available to all roles
router.get(
    '/:id',
    getBeatPlanById
);

// Mark a party as visited in beat plan - Salesperson can mark visits
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

module.exports = router;
