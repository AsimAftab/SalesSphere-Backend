const express = require('express');
const {
    createTourPlan,
    getAllTourPlans,
    getTourPlanById,
    updateTourPlan,
    deleteTourPlan,
    updateTourPlanStatus,
    bulkDeleteTourPlans,
} = require('./tour-plans.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// 1. Global Middleware
router.use(protect);

// ============================================
// TOUR PLAN ROUTES
// ============================================

// 2. Specialized/Administrative Routes
// Must stay ABOVE /:id to prevent "bulk-delete" being treated as an ID
router.delete('/bulk-delete', restrictTo('admin', 'manager'), bulkDeleteTourPlans);

// 3. Collection Routes (/)
router.route('/')
    .get(getAllTourPlans)
    .post(createTourPlan);

// 4. Specific Resource Routes (/:id)
router.route('/:id')
    .get(getTourPlanById)
    .patch(updateTourPlan) // Changed to PATCH for partial updates
    .delete(restrictTo('admin', 'manager'), deleteTourPlan);

// 5. Action-Specific Routes
router.patch('/:id/status', restrictTo('admin', 'manager'), updateTourPlanStatus);

module.exports = router;