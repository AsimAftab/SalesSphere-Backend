// src/api/attendance/attendance.route.js
// Attendance routes - permission-based access

const express = require('express');
const {
    checkIn,
    checkOut,
    getMyStatusToday,
    getMyMonthlyReport,
    getAttendanceReport,
    getEmployeeAttendanceByDate,
    adminMarkAttendance,
    adminMarkAbsentees,
    adminMarkHoliday,
    searchAttendance
} = require('./attendance.controller');
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/status/today', requirePermission('attendance', 'view'), getMyStatusToday);
router.get('/my-monthly-report', requirePermission('attendance', 'view'), getMyMonthlyReport);
router.get('/search', requirePermission('attendance', 'view'), searchAttendance);
router.get('/report', requirePermission('attendance', 'view'), getAttendanceReport);
router.get('/employee/:employeeId/date/:date', requirePermission('attendance', 'view'), getEmployeeAttendanceByDate);

// ============================================
// ADD OPERATIONS (check-in, mark absentees, mark holiday)
// ============================================
router.post('/check-in', requirePermission('attendance', 'add'), checkIn);
router.post('/admin/mark-absentees', requirePermission('attendance', 'add'), adminMarkAbsentees);
router.post('/admin/mark-holiday', requirePermission('attendance', 'add'), adminMarkHoliday);

// ============================================
// UPDATE OPERATIONS (check-out, admin mark)
// ============================================
router.put('/check-out', requirePermission('attendance', 'update'), checkOut);
router.put('/admin/mark', requirePermission('attendance', 'update'), adminMarkAttendance);

module.exports = router;