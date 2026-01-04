// src/api/beat-plans/beat-plan.route.js
// Beat plan routes - permission-based access

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
    optimizeBeatPlanRoute
} = require('./beat-plan.controller');
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/salesperson', requirePermission('beatPlan', 'view'), getSalespersons);
router.get('/available-directories', requirePermission('beatPlan', 'view'), getAvailableDirectories);
router.get('/data', requirePermission('beatPlan', 'view'), getBeatPlanData);
router.get('/my-beatplans', requirePermission('beatPlan', 'view'), getMyBeatPlans);
router.get('/', requirePermission('beatPlan', 'view'), getAllBeatPlans);
router.get('/:id/details', requirePermission('beatPlan', 'view'), getBeatPlanDetails);
router.get('/:id', requirePermission('beatPlan', 'view'), getBeatPlanById);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('beatPlan', 'add'), createBeatPlan);
router.post('/calculate-distance', requirePermission('beatPlan', 'view'), calculateDistanceToParty);
router.post('/:id/optimize-route', requirePermission('beatPlan', 'update'), optimizeBeatPlanRoute);
router.post('/:id/start', requirePermission('beatPlan', 'update'), startBeatPlan);
router.post('/:id/visit', requirePermission('beatPlan', 'update'), markPartyVisited);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.put('/:id', requirePermission('beatPlan', 'update'), updateBeatPlan);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('beatPlan', 'delete'), deleteBeatPlan);

module.exports = router;
