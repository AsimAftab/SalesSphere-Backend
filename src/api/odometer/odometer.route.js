// routes/odometer.route.js
const express = require('express');
const multer = require('multer');
const {
    startReading,
    stopReading,
    getStatusToday,
    getMyMonthlyReport,
    getOdometerReport,
    uploadStartImage,
    uploadStopImage,
    deleteStartImage,
    deleteStopImage,
    deleteOdometerEntry,
} = require('./odometer.controller');
const { protect, checkAccess } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Multer configuration for image uploads
const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Apply authentication to all routes
router.use(protect);

// ============================================
// EMPLOYEE ACTIONS
// ============================================

// @route   POST /api/v1/odometer/start
// @desc    Record start odometer reading
// @access  Private (odometer:record)
router.post('/start',
    checkAccess('odometer', 'record'),
    startReading
);

// @route   PUT /api/v1/odometer/stop
// @desc    Record stop odometer reading
// @access  Private (odometer:record)
router.put('/stop',
    checkAccess('odometer', 'record'),
    stopReading
);

// @route   GET /api/v1/odometer/status/today
// @desc    Get today's odometer status
// @access  Private (odometer:view)
router.get('/status/today',
    checkAccess('odometer', 'view'),
    getStatusToday
);

// @route   GET /api/v1/odometer/my-monthly-report
// @desc    Get personal monthly odometer report
// @access  Private (odometer:view)
router.get('/my-monthly-report',
    checkAccess('odometer', 'view'),
    getMyMonthlyReport
);

// ============================================
// ADMIN/MANAGER VIEWS
// ============================================

// @route   GET /api/v1/odometer/report
// @desc    Get team/org odometer report
// @access  Private (odometer:view)
router.get('/report',
    checkAccess('odometer', 'view'),
    getOdometerReport
);

// ============================================
// IMAGE UPLOAD ROUTES
// ============================================

// @route   POST /api/v1/odometer/:id/start-image
// @desc    Upload start odometer image
// @access  Private (odometer:record)
router.post('/:id/start-image',
    checkAccess('odometer', 'record'),
    imageUpload.single('image'),
    uploadStartImage
);

// @route   POST /api/v1/odometer/:id/stop-image
// @desc    Upload stop odometer image
// @access  Private (odometer:record)
router.post('/:id/stop-image',
    checkAccess('odometer', 'record'),
    imageUpload.single('image'),
    uploadStopImage
);

// @route   DELETE /api/v1/odometer/:id/start-image
// @desc    Delete start odometer image
// @access  Private (odometer:record)
router.delete('/:id/start-image',
    checkAccess('odometer', 'record'),
    deleteStartImage
);

// @route   DELETE /api/v1/odometer/:id/stop-image
// @desc    Delete stop odometer image
// @access  Private (odometer:record)
router.delete('/:id/stop-image',
    checkAccess('odometer', 'record'),
    deleteStopImage
);

// ============================================
// DELETE OPERATIONS
// ============================================

// @route   DELETE /api/v1/odometer/:id
// @desc    Delete odometer entry
// @access  Private (odometer:delete)
router.delete('/:id',
    checkAccess('odometer', 'delete'),
    deleteOdometerEntry
);

module.exports = router;
