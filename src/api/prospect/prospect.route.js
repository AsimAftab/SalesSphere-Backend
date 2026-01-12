// src/api/prospect/prospect.route.js
// Prospect management routes - granular feature-based access control

const express = require('express');
const multer = require('multer');
const {
    createProspect,
    getAllProspects,
    getProspectById,
    updateProspect,
    deleteProspect,
    transferToParty,
    getAllProspectsDetails,
    createProspectCategory,
    getProspectCategories,
    updateProspectCategory,
    deleteProspectCategory,
    uploadProspectImage,
    deleteProspectImage,
    // Assignment controllers
    assignUsersToProspect,
    removeUserFromProspect,
    getProspectAssignments,
    getMyAssignedProspects
} = require('./prospect.controller');
const { protect, requireOrgAdmin } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

const router = express.Router();

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
// VIEW OPERATIONS
// ============================================
// GET / - View the list of potential leads and prospects
router.get('/',
    checkAccess('prospects', 'viewList'),
    getAllProspects
);

// GET /details - View all prospects with full details
router.get('/details',
    checkAccess('prospects', 'viewDetails'),
    getAllProspectsDetails
);

// GET /categories - View prospect categories (all authenticated users can view)
router.get('/categories',
    getProspectCategories
);

// POST /categories - Create new prospect category (all authenticated users)
router.post('/categories',
    checkAccess('prospects', 'create'),
    createProspectCategory
);

// PUT /categories/:id - Update prospect category (admin only)
router.put('/categories/:id',
    requireOrgAdmin(),
    updateProspectCategory
);

// DELETE /categories/:id - Delete prospect category (admin only)
router.delete('/categories/:id',
    requireOrgAdmin(),
    deleteProspectCategory
);

// ============================================
// ASSIGNMENT ROUTES (must be before /:id wildcard)
// ============================================
// GET /my-assigned - Get prospects assigned to current user
router.get('/my-assigned',
    checkAccess('prospects', 'viewAssigned'),
    getMyAssignedProspects
);

// POST /:id/assign - Assign user(s) to a prospect
router.post('/:id/assign',
    checkAccess('prospects', 'assign'),
    assignUsersToProspect
);

// DELETE /:id/assign - Remove user assignment(s) from prospect
// Body: { userIds: string[] } - supports single or multiple user IDs
router.delete('/:id/assign',
    checkAccess('prospects', 'assign'),
    removeUserFromProspect
);

// GET /:id/assignments - Get all users assigned to a prospect
router.get('/:id/assignments',
    checkAccess('prospects', 'viewDetails'),
    getProspectAssignments
);

// GET /:id - View specific prospect details
router.get('/:id',
    checkAccess('prospects', 'viewDetails'),
    getProspectById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Add new prospective clients to the system
router.post('/',
    checkAccess('prospects', 'create'),
    createProspect
);

// POST /:id/images - Upload profile photos for the prospect
router.post('/:id/images',
    checkAccess('prospects', 'manageImages'),
    imageUpload.single('image'),
    uploadProspectImage
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Edit prospect contact information and lead details
router.put('/:id',
    checkAccess('prospects', 'update'),
    updateProspect
);

// POST /:id/transfer - Convert prospect to a formal Party/Client
router.post('/:id/transfer',
    checkAccess('prospects', 'transferToParty'),
    transferToParty
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id/images/:imageNumber - Permanently remove images from prospect profile
router.delete('/:id/images/:imageNumber',
    checkAccess('prospects', 'manageImages'),
    deleteProspectImage
);

// DELETE /:id - Remove prospect records from the system
router.delete('/:id',
    checkAccess('prospects', 'delete'),
    deleteProspect
);



// ============================================
// IMPORT/EXPORT ROUTES (Future)
// ============================================
// POST /import - Import prospects via CSV
// router.post('/import',
//     checkAccess('prospects', 'import'),
//     importProspects
// );

// GET /export/pdf - Export prospects list as PDF
// router.get('/export/pdf',
//     checkAccess('prospects', 'exportPdf'),
//     exportProspectsPdf
// );

// GET /export/excel - Export prospect data to Excel
// router.get('/export/excel',
//     checkAccess('prospects', 'exportExcel'),
//     exportProspectsExcel
// );

module.exports = router;