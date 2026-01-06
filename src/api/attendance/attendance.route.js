// src/api/attendance/attendance.route.js
// Attendance routes - granular feature-based access control

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
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// DEPENDENCY: Basic Attendance Permissions
// ============================================
// Users with webCheckIn or mobileCheckIn automatically get:
// - check-in, check-out, view status today, view monthly report
const BASIC_ATTENDANCE_ACCESS = [
    { module: 'attendance', feature: 'webCheckIn' },
    { module: 'attendance', feature: 'mobileCheckIn' },
    { module: 'attendance', feature: 'viewMyAttendance' } // Standalone view-only permission
];

// ============================================
// VIEW OPERATIONS - OWN ATTENDANCE
// ============================================
// GET /status/today - View own attendance status for today
// Dependency: Anyone who can check-in can also view their status
router.get('/status/today',
    checkAnyAccess(BASIC_ATTENDANCE_ACCESS),
    getMyStatusToday
);

// GET /my-monthly-report - View own monthly attendance report
// Dependency: Anyone who can check-in can also view their monthly report
router.get('/my-monthly-report',
    checkAnyAccess(BASIC_ATTENDANCE_ACCESS),
    getMyMonthlyReport
);

// ============================================
// VIEW OPERATIONS - TEAM ATTENDANCE
// ============================================
// GET /search - Search attendance records (view team/subordinates)
router.get('/search',
    checkAccess('attendance', 'viewTeamAttendance'),
    searchAttendance
);

// GET /report - Get attendance report (view team/subordinates)
router.get('/report',
    checkAccess('attendance', 'viewTeamAttendance'),
    getAttendanceReport
);

// GET /employee/:employeeId/date/:date - View specific employee's attendance (view team/subordinates)
router.get('/employee/:employeeId/date/:date',
    checkAccess('attendance', 'viewTeamAttendance'),
    getEmployeeAttendanceByDate
);

// ============================================
// CHECK-IN / CHECK-OUT OPERATIONS
// ============================================
// POST /check-in - Check-in via web or mobile app
// Requires either webCheckIn OR mobileCheckIn permission
router.post('/check-in',
    checkAnyAccess([
        { module: 'attendance', feature: 'webCheckIn' },
        { module: 'attendance', feature: 'mobileCheckIn' }
    ]),
    checkIn
);

// PUT /check-out - Check-out via web or mobile app
// Dependency: Anyone who can check-in can also check-out
router.put('/check-out',
    checkAnyAccess([
        { module: 'attendance', feature: 'webCheckIn' },
        { module: 'attendance', feature: 'mobileCheckIn' }
    ]),
    checkOut
);

// ============================================
// ADMIN MARKING OPERATIONS
// ============================================
// POST /admin/mark-holiday - Admin: Mark holiday for organization
router.post('/admin/mark-holiday',
    checkAccess('attendance', 'markHoliday'),
    adminMarkHoliday
);

// POST /admin/mark-absentees - Admin: Mark absentees manually
router.post('/admin/mark-absentees',
    checkAccess('attendance', 'updateAttendance'),
    adminMarkAbsentees
);

// PUT /admin/mark - Admin: Mark present, absent, leave and half day manually
router.put('/admin/mark',
    checkAccess('attendance', 'updateAttendance'),
    adminMarkAttendance
);

module.exports = router;