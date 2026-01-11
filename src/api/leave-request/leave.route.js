// src/api/leave-request/leave.route.js
// Leave request routes - granular feature-based access control

const express = require('express');
const {
    createLeaveRequest,
    getAllLeaveRequests,
    getMyLeaveRequests,
    getLeaveRequestById,
    updateLeaveRequest,
    deleteLeaveRequest,
    updateLeaveRequestStatus,
    bulkDeleteLeaveRequests,
} = require('./leave.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
// GET /my-requests - View own leave requests only (for employees)
router.get('/my-requests',
    checkAccess('leaves', 'viewOwn'),
    getMyLeaveRequests
);

// GET / - View all employee leave requests and history (for admin/managers)
router.get('/',
    checkAccess('leaves', 'viewList'),
    getAllLeaveRequests
);

// GET /:id - View leave request details and comments
// Users with viewOwn can view their own, users with viewList can view any
router.get('/:id',
    checkAnyAccess([
        { module: 'leaves', feature: 'viewList' },
        { module: 'leaves', feature: 'viewDetails' }
    ]),
    getLeaveRequestById
);

// ============================================
// CREATE OPERATION
// ============================================
// POST / - Create new leave request
router.post('/',
    checkAccess('leaves', 'create'),
    createLeaveRequest
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Edit own leave request (before approval)
router.put('/:id',
    checkAccess('leaves', 'update'),
    updateLeaveRequest
);

// PATCH /:id/status - Approve, reject, or comment on pending leave applications
router.patch('/:id/status',
    checkAccess('leaves', 'updateStatus'),
    updateLeaveRequestStatus
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /bulk-delete - Bulk delete leave requests
router.delete('/bulk-delete',
    checkAccess('leaves', 'bulkDelete'),
    bulkDeleteLeaveRequests
);

// DELETE /:id - Delete/cancel leave request
router.delete('/:id',
    checkAccess('leaves', 'delete'),
    deleteLeaveRequest
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Export leave records as PDF
// router.get('/export/pdf',
//     checkAccess('leaves', 'exportPdf'),
//     exportLeavesPdf
// );

// GET /export/excel - Export leave data to Excel
// router.get('/export/excel',
//     checkAccess('leaves', 'exportExcel'),
//     exportLeavesExcel
// );

module.exports = router;
