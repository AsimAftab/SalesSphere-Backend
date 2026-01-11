// src/api/tour-plans/tour-plans.route.js
// Tour plan management routes - granular feature-based access control

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
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
// GET /my-tour-plans - View own tour plans and requests
router.get('/my-tour-plans',
    checkAccess('tourPlan', 'viewOwn'),
    getMyTourPlans
);

// GET / - View the list of all scheduled employee tours (for admin/managers)
router.get('/',
    checkAccess('tourPlan', 'viewList'),
    getAllTourPlans
);

// GET /:id - Access in-depth information, itinerary, and stops within a tour
// Users with viewList can view any, users with viewOwn/viewDetails can view accessible tours
router.get('/:id',
    checkAnyAccess([
        { module: 'tourPlan', feature: 'viewList' },
        { module: 'tourPlan', feature: 'viewDetails' },
        { module: 'tourPlan', feature: 'viewOwn' }
    ]),
    getTourPlanById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Create and schedule new tours for staff
router.post('/',
    checkAccess('tourPlan', 'create'),
    createTourPlan
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PATCH /:id/status - Approve, reject, or update the progress of a tour plan
router.patch('/:id/status',
    checkAccess('tourPlan', 'updateStatus'),
    updateTourPlanStatus
);

// PATCH /:id - Edit specific details, dates, or routes of an existing tour plan
router.patch('/:id',
    checkAccess('tourPlan', 'update'),
    updateTourPlan
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /bulk-delete - Mass delete multiple tour records simultaneously
// NOTE: Must come before /:id to avoid route matching issues
router.delete('/bulk-delete',
    checkAccess('tourPlan', 'bulkDelete'),
    bulkDeleteTourPlans
);

// DELETE /:id - Permanently remove a specific tour plan from the system
router.delete('/:id',
    checkAccess('tourPlan', 'delete'),
    deleteTourPlan
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Export tour schedules as PDF documents
// router.get('/export/pdf',
//     checkAccess('tourPlan', 'exportPdf'),
//     exportTourPlansPdf
// );

// GET /export/excel - Export tour data to an Excel spreadsheet
// router.get('/export/excel',
//     checkAccess('tourPlan', 'exportExcel'),
//     exportTourPlansExcel
// );

module.exports = router;