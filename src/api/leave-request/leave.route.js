// src/api/leave-request/leave.route.js
// Leave request routes - permission-based access

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
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/my-requests', requirePermission('leaves', 'view'), getMyLeaveRequests);
router.get('/', requirePermission('leaves', 'view'), getAllLeaveRequests);
router.get('/:id', requirePermission('leaves', 'view'), getLeaveRequestById);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('leaves', 'add'), createLeaveRequest);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.put('/:id', requirePermission('leaves', 'update'), updateLeaveRequest);
router.patch('/:id/status', requirePermission('leaves', 'update'), updateLeaveRequestStatus);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('leaves', 'delete'), deleteLeaveRequest);
router.delete('/bulk-delete', requirePermission('leaves', 'delete'), bulkDeleteLeaveRequests);

module.exports = router;
