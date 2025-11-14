const express = require('express');
const multer = require('multer'); // Import multer
const userController = require('./user.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const handleMulterErrors = require('../../middlewares/multerError.middleware');
const router = express.Router();

// Configure multer for DOCUMENTS: PDF only, 2MB limit
const documentUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF documents up to 2MB are allowed!'), false);
        }
    }
});

// Configure a SEPARATE multer for IMAGES
const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files up to 5MB are allowed!'), false);
        }
    }
});


// Apply the 'protect' middleware to ALL routes below this point
router.use(protect);

// --- SUPERADMIN ONLY: System Overview ---
router.get('/system-overview', restrictTo('superadmin'), userController.getSystemOverview);

// --- SUPERADMIN ONLY: System User Management ---
router.post(
    '/system-user',
    restrictTo('superadmin'),
    imageUpload.single('avatar'),
    userController.addSystemUser
);

router.get(
    '/system-users',
    restrictTo('superadmin'),
    userController.getAllSystemUsers
);
// --- END System User Management ---

// --- NEW: Routes for the logged-in user ('/me') ---
// These do NOT need restrictTo, as users manage their own profile
router.route('/me')
    .get(userController.getMyProfile)       // Get own profile
    .put(userController.updateMyProfile);   // Update own profile details

router.put('/me/password', userController.updateMyPassword); // Update own password

router.put(
    '/me/profile-image', // Update own profile image
    imageUpload.single('profileImage'),
    userController.updateMyProfileImage
);
// --- END NEW /me ROUTES ---


// --- Routes for managing OTHER users (Admin/Manager only) ---
router.route('/')
    .post(restrictTo('admin', 'manager'), imageUpload.single('avatar'), userController.createUser)
    
    .get(restrictTo('admin', 'manager'), userController.getAllUsers);

router.route('/:id')
    .get(restrictTo('admin', 'manager'), userController.getUserById)
    .put(restrictTo('admin', 'manager'), imageUpload.single('avatar'), userController.updateUser) 
    .delete(restrictTo('admin', 'manager'), userController.deleteUser);

// --- Attendance Summary for Specific Employee ---
router.get('/:employeeId/attendance-summary', userController.getEmployeeAttendanceSummary);

router.post(
    '/:id/documents',
    restrictTo('admin', 'manager'),
    documentUpload.array('documents', 2),
    handleMulterErrors,
    userController.uploadUserDocuments
);
// --- END Admin/Manager Routes ---

module.exports = router;

