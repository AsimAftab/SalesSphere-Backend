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
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// ============================================
// SPECIALIZED ROUTES (must come before /:id)
// ============================================

// Bulk delete leave requests
router.delete(
    '/bulk-delete',
    restrictTo('admin'),
    bulkDeleteLeaveRequests
);

// Get my leave requests
router.get(
    '/my-requests',
    getMyLeaveRequests
);

// ============================================
// LEAVE REQUEST ROUTES
// ============================================

// Create a new leave request
router.post(
    '/',
    createLeaveRequest
);

// Get all leave requests
router.get(
    '/',
    restrictTo('admin', 'manager'),
    getAllLeaveRequests
);

// Get a single leave request by ID
router.get(
    '/:id',
    getLeaveRequestById
);

// Update a leave request
router.put(
    '/:id',
    updateLeaveRequest
);

// Delete a leave request
router.delete(
    '/:id',
    deleteLeaveRequest
);

// Update leave request status (approve/reject)
router.patch(
    '/:id/status',
    restrictTo('admin', 'manager'),
    updateLeaveRequestStatus
);

module.exports = router;
