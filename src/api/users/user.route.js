// src/api/users/user.route.js
// User management routes - migrated to permission-based access

const express = require('express');
const multer = require('multer');
const userController = require('./user.controller');
const {
    protect,
    requirePermission,
    requireSystemRole,
    requireOrgAdmin
} = require('../../middlewares/auth.middleware');
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

// Configure multer for IMAGES: 5MB limit
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

// Apply protect middleware to all routes
router.use(protect);

// ============================================
// SYSTEM ROUTES (superadmin/developer only)
// ============================================

// System overview - system roles only
router.get('/system-overview', requireSystemRole(), userController.getSystemOverview);

// System user CRUD - requires systemUsers permission
router.post(
    '/system-user',
    requirePermission('systemUsers', 'write'),
    imageUpload.single('avatar'),
    userController.addSystemUser
);

router.get(
    '/system-users',
    requirePermission('systemUsers', 'read'),
    userController.getAllSystemUsers
);

router.get(
    '/system-user/:id',
    requirePermission('systemUsers', 'read'),
    userController.getSystemUserById
);

router.put(
    '/system-user/:id',
    requirePermission('systemUsers', 'write'),
    imageUpload.single('avatar'),
    userController.updateSystemUser
);

// Create user in any organization - system roles only
router.post(
    '/org-user',
    requireSystemRole(),
    imageUpload.single('avatar'),
    userController.createOrgUser
);

// ============================================
// SELF-MANAGEMENT ROUTES (/me)
// No special permissions needed - users manage their own profile
// ============================================

router.route('/me')
    .get(userController.getMyProfile)
    .put(userController.updateMyProfile);

router.put('/me/password', userController.updateMyPassword);

router.put(
    '/me/profile-image',
    imageUpload.single('profileImage'),
    userController.updateMyProfileImage
);

// ============================================
// ORGANIZATION USER MANAGEMENT
// Requires employees permission
// ============================================

// Create/List users in organization
router.route('/')
    .post(
        requirePermission('employees', 'write'),
        imageUpload.single('avatar'),
        userController.createUser
    )
    .get(
        requirePermission('employees', 'read'),
        userController.getAllUsers
    );

// Get/Update/Delete specific user
router.route('/:id')
    .get(requirePermission('employees', 'read'), userController.getUserById)
    .put(
        requirePermission('employees', 'write'),
        imageUpload.single('avatar'),
        userController.updateUser
    )
    .delete(requirePermission('employees', 'delete'), userController.deleteUser);

// Employee attendance summary - requires attendance read
router.get(
    '/:employeeId/attendance-summary',
    requirePermission('attendance', 'read'),
    userController.getEmployeeAttendanceSummary
);

// Upload/Delete user documents - requires employees write
router.post(
    '/:id/documents',
    requirePermission('employees', 'write'),
    documentUpload.array('documents', 2),
    handleMulterErrors,
    userController.uploadUserDocuments
);

router.delete(
    '/:id/documents/:documentId',
    requirePermission('employees', 'delete'),
    userController.deleteUserDocument
);

module.exports = router;
