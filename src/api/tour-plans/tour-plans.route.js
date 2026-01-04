// src/api/tour-plans/tour-plans.route.js
// Tour plan management routes - permission-based access

const express = require('express');
const {
    createTourPlan,
    getAllTourPlans,
    getMyTourPlans,
    getTourPlanById,
    updateTourPlan,
    deleteTourPlan,
    updateTourPlanStatus,
    bulkDeleteTourPlans,
} = require('./tour-plans.controller');
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/my-tour-plans', requirePermission('tourPlan', 'view'), getMyTourPlans);
router.get('/', requirePermission('tourPlan', 'view'), getAllTourPlans);
router.get('/:id', requirePermission('tourPlan', 'view'), getTourPlanById);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('tourPlan', 'add'), createTourPlan);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.patch('/:id', requirePermission('tourPlan', 'update'), updateTourPlan);
router.patch('/:id/status', requirePermission('tourPlan', 'update'), updateTourPlanStatus);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('tourPlan', 'delete'), deleteTourPlan);
router.delete('/bulk-delete', requirePermission('tourPlan', 'delete'), bulkDeleteTourPlans);

module.exports = router;