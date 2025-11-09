const express = require('express');
const {
    checkIn, // <-- RENAMED
    checkOut, // <-- NEW
    getMyStatusToday,
    getAttendanceReport,
    getEmployeeAttendanceByDate, // <-- NEW
    adminMarkAttendance,
    adminMarkAbsentees, // <-- NEW
    adminMarkHoliday // <-- NEW
} = require('./attendance.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// --- Salesperson / Manager ("App") Routes ---

// Mark my own attendance for today
router.post(
    '/check-in', // <-- UPDATED ROUTE
    restrictTo('salesperson', 'manager'), // Added manager
    checkIn
);

// Add new check-out route
router.put(
    '/check-out', // <-- NEW ROUTE
    restrictTo('salesperson', 'manager'), // Added manager
    checkOut
);

// Get my attendance status for today
router.get(
    '/status/today',
    restrictTo('salesperson', 'manager'), // Added manager
    getMyStatusToday
);

// --- Admin/Manager ("Web") Routes ---

// Get the full monthly report for the dashboard
router.get(
    '/report',
    restrictTo('admin', 'manager'),
    getAttendanceReport
);

// Get detailed attendance for a specific employee on a specific date
router.get(
    '/employee/:employeeId/date/:date',
    restrictTo('admin', 'manager'),
    getEmployeeAttendanceByDate
);

// Admin/Manager manually marks/overrides attendance
router.put(
    '/admin/mark',
    restrictTo('admin', 'manager'),
    adminMarkAttendance
);

// Admin manually triggers the "mark absentees" job
router.post(
    '/admin/mark-absentees', // <-- NEW ROUTE
    restrictTo('admin'), // Only Admin should run this
    adminMarkAbsentees
);

// Admin marks a holiday for all employees on a specific date
router.post(
    '/admin/mark-holiday', 
    restrictTo('admin','manager'), // Only Admin and manager should run this
    adminMarkHoliday
);

module.exports = router;