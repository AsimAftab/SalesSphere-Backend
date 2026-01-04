// src/api/users/user.route.js
// User management routes - permission-based access

const express = require('express');
const multer = require('multer');
const userController = require('./user.controller');
const {
    protect,
    requirePermission,
    requireSystemRole
} = require('../../middlewares/auth.middleware');
const handleMulterErrors = require('../../middlewares/multerError.middleware');

const router = express.Router();

// Multer for documents (PDF, 2MB)
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

// Multer for images (5MB)
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

router.use(protect);

// ============================================
// SYSTEM ROUTES (superadmin/developer)
// ============================================
router.get('/system-overview', requireSystemRole(), userController.getSystemOverview);

router.post('/system-user', requirePermission('systemUsers', 'add'), imageUpload.single('avatar'), userController.addSystemUser);
router.get('/system-users', requirePermission('systemUsers', 'view'), userController.getAllSystemUsers);
router.get('/system-user/:id', requirePermission('systemUsers', 'view'), userController.getSystemUserById);
router.put('/system-user/:id', requirePermission('systemUsers', 'update'), imageUpload.single('avatar'), userController.updateSystemUser);

router.post('/org-user', requireSystemRole(), imageUpload.single('avatar'), userController.createOrgUser);

// ============================================
// SELF ROUTES (/me) - no special permissions
// ============================================
router.route('/me')
    .get(userController.getMyProfile)
    .put(userController.updateMyProfile);

router.put('/me/password', userController.updateMyPassword);
router.put('/me/profile-image', imageUpload.single('profileImage'), userController.updateMyProfileImage);

// ============================================
// EMPLOYEE MANAGEMENT
// ============================================
router.route('/')
    .post(requirePermission('employees', 'add'), imageUpload.single('avatar'), userController.createUser)
    .get(requirePermission('employees', 'view'), userController.getAllUsers);

router.route('/:id')
    .get(requirePermission('employees', 'view'), userController.getUserById)
    .put(requirePermission('employees', 'update'), imageUpload.single('avatar'), userController.updateUser)
    .delete(requirePermission('employees', 'delete'), userController.deleteUser);

router.get('/:employeeId/attendance-summary', requirePermission('attendance', 'view'), userController.getEmployeeAttendanceSummary);

router.post('/:id/documents', requirePermission('employees', 'add'), documentUpload.array('documents', 2), handleMulterErrors, userController.uploadUserDocuments);
router.delete('/:id/documents/:documentId', requirePermission('employees', 'delete'), userController.deleteUserDocument);

module.exports = router;
