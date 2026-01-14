// src/api/beat-plans/beat-plan.route.js
// Beat plan routes - granular feature-based access control

const express = require('express');
const {
    getSalespersons,
    getAvailableDirectories,
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
    optimizeBeatPlanRoute,
    cloneBeatPlan,
    getArchivedBeatPlans,
    getArchivedBeatPlanById
} = require('./beat-plan.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// HISTORY/ARCHIVE OPERATIONS
// ============================================
// GET /history - View archived/completed beat plans
router.get('/history',
    checkAccess('beatPlan', 'viewList'),
    getArchivedBeatPlans
);

// GET /history/:id - View specific archived beat plan
router.get('/history/:id',
    checkAccess('beatPlan', 'viewDetails'),
    getArchivedBeatPlanById
);

// ============================================
// VIEW OPERATIONS
// ============================================
// GET /salesperson - View list of salespersons for beat plan assignment
router.get('/salesperson',
    checkAccess('beatPlan', 'viewSalespersons'),
    getSalespersons
);

// GET /available-directories - View available beat plan directories/categories
router.get('/available-directories',
    checkAccess('beatPlan', 'viewDirectories'),
    getAvailableDirectories
);

// GET /data - Get beat plan data (needs list or details access)
router.get('/data',
    checkAnyAccess([
        { module: 'beatPlan', feature: 'viewList' },
        { module: 'beatPlan', feature: 'viewOwn' },
        { module: 'beatPlan', feature: 'viewDetails' }
    ]),
    getBeatPlanData
);

// GET /my-beatplans - View own assigned beat plans
router.get('/my-beatplans',
    checkAccess('beatPlan', 'viewOwn'),
    getMyBeatPlans
);

// GET / - View all beat plans and routes
router.get('/',
    checkAccess('beatPlan', 'viewList'),
    getAllBeatPlans
);

// GET /:id/details - View detailed beat plan information including parties and visits
router.get('/:id/details',
    checkAccess('beatPlan', 'viewDetails'),
    getBeatPlanDetails
);

// GET /:id - View specific beat plan (details access)
router.get('/:id',
    checkAccess('beatPlan', 'viewDetails'),
    getBeatPlanById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Create new beat plans and assign to users
router.post('/',
    checkAccess('beatPlan', 'create'),
    createBeatPlan
);

// POST /:id/clone - Clone beat plan for reuse with new date/employees
router.post('/:id/clone',
    checkAccess('beatPlan', 'create'),
    cloneBeatPlan
);

// POST /calculate-distance - Calculate distance to parties from current location
router.post('/calculate-distance',
    checkAccess('beatPlan', 'calculateDistance'),
    calculateDistanceToParty
);

// ============================================
// EXECUTION OPERATIONS
// ============================================
// POST /:id/start - Start/resume beat plan execution
router.post('/:id/start',
    checkAccess('beatPlan', 'startExecution'),
    startBeatPlan
);

// POST /:id/visit - Mark parties as visited during beat execution
router.post('/:id/visit',
    checkAccess('beatPlan', 'markVisit'),
    markPartyVisited
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Edit beat plan details (parties, dates, etc.)
router.put('/:id',
    checkAccess('beatPlan', 'update'),
    updateBeatPlan
);

// POST /:id/optimize-route - Optimize beat plan route for efficiency
router.post('/:id/optimize-route',
    checkAccess('beatPlan', 'optimizeRoute'),
    optimizeBeatPlanRoute
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Delete beat plans
router.delete('/:id',
    checkAccess('beatPlan', 'delete'),
    deleteBeatPlan
);

module.exports = router;
