// src/api/users/user.route.js
// User management routes - granular feature-based access control

const express = require('express');
const multer = require('multer');
const userController = require('./user.controller');
const {
    protect,
    checkAccess,
    checkAnyAccess,
    requireSystemRole,
    requireOrgAdmin
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
// GET /system-overview - System overview dashboard (superadmin/developer only)
router.get('/system-overview',
    requireSystemRole(),
    userController.getSystemOverview
);

// POST /system-user - Add new system user (superadmin/developer)
router.post('/system-user',
    checkAccess('systemUsers', 'create'),
    imageUpload.single('avatar'),
    userController.addSystemUser
);

// GET /system-users - View all system users
router.get('/system-users',
    checkAccess('systemUsers', 'viewList'),
    userController.getAllSystemUsers
);

// GET /system-user/:id - View detailed system user information
router.get('/system-user/:id',
    checkAccess('systemUsers', 'viewDetails'),
    userController.getSystemUserById
);

// PUT /system-user/:id - Edit system user details
router.put('/system-user/:id',
    checkAccess('systemUsers', 'update'),
    imageUpload.single('avatar'),
    userController.updateSystemUser
);

// POST /org-user - Create organization with admin user (superadmin only)
router.post('/org-user',
    requireSystemRole(),
    imageUpload.single('avatar'),
    userController.createOrgUser
);

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
// POST / - Onboard and add new employees to the system
router.post('/',
    checkAccess('employees', 'create'),
    imageUpload.single('avatar'),
    userController.createUser
);

// GET / - View all registered employees and their basic info
router.get('/',
    checkAccess('employees', 'viewList'),
    userController.getAllUsers
);

// GET /:id - Access full profile, including personal and professional info
// Users can view their own profile with viewOwn permission
router.get('/:id',
    checkAnyAccess([
        { module: 'employees', feature: 'viewDetails' },
        { module: 'employees', feature: 'viewOwn' }
    ]),
    userController.getUserById
);

// PUT /:id - Edit employee profile details and work information
router.put('/:id',
    checkAccess('employees', 'update'),
    imageUpload.single('avatar'),
    userController.updateUser
);

// DELETE /:id - Remove employee records from the system
router.delete('/:id',
    checkAccess('employees', 'delete'),
    userController.deleteUser
);

// GET /:employeeId/attendance-summary - View specific attendance history for an employee
router.get('/:employeeId/attendance-summary',
    checkAccess('employees', 'viewAttendance'),
    userController.getEmployeeAttendanceSummary
);

// PATCH /:id/access - Toggle user access (Mobile/Web) - Admin only
router.patch('/:id/access',
    requireOrgAdmin(),
    userController.toggleUserAccess
);

// POST /:id/documents - Upload sensitive documents (ID, Contract, etc.) to employee profiles
router.post('/:id/documents',
    checkAccess('employees', 'uploadDocuments'),
    documentUpload.array('documents', 2),
    handleMulterErrors,
    userController.uploadUserDocuments
);

// DELETE /:id/documents/:documentId - Permanently remove uploaded documents from employee records
router.delete('/:id/documents/:documentId',
    checkAccess('employees', 'deleteDocuments'),
    userController.deleteUserDocument
);

module.exports = router;
