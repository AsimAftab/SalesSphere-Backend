// src/api/parties/party.routes.js
// Party management routes - granular feature-based access control

const express = require('express');
const {
    createParty,
    getAllParties,
    getAllPartiesDetails,
    getPartyById,
    updateParty,
    deleteParty,
    uploadPartyImage,
    deletePartyImage,
    bulkImportParties,
    getPartyTypes,
    createPartyType,
    updatePartyType,
    deletePartyType,
    // Assignment controllers
    assignUsersToParty,
    removeUserFromParty,
    getPartyAssignments,
    getMyAssignedParties
} = require('./party.controller');
const { protect, requireOrgAdmin } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');
const multer = require('multer');

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
// GET / - View all registered parties, clients, and vendors
router.get('/',
    checkAccess('parties', 'viewList'),
    getAllParties
);

// GET /details - View all parties with full details
router.get('/details',
    checkAccess('parties', 'viewDetails'),
    getAllPartiesDetails
);

// GET /types - View available party types (all authenticated users)
router.get('/types', getPartyTypes);

// ============================================
// ASSIGNMENT ROUTES (must be before /:id wildcard)
// ============================================
// GET /my-assigned - Get parties assigned to current user
router.get('/my-assigned',
    checkAccess('parties', 'viewAssigned'),
    getMyAssignedParties
);

// POST /:id/assign - Assign user(s) to a party
router.post('/:id/assign',
    checkAccess('parties', 'assign'),
    assignUsersToParty
);

// DELETE /:id/assign - Remove user assignment(s) from party
// Body: { userIds: string[] } - supports single or multiple user IDs
router.delete('/:id/assign',
    checkAccess('parties', 'assign'),
    removeUserFromParty
);

// GET /:id/assignments - Get all users assigned to a party
router.get('/:id/assignments',
    checkAccess('parties', 'viewDetails'),
    getPartyAssignments
);

// GET /:id - Access comprehensive profile and history for a specific party
router.get('/:id',
    checkAccess('parties', 'viewDetails'),
    getPartyById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Add new parties to the system
router.post('/',
    checkAccess('parties', 'create'),
    createParty
);

// POST /bulk-import - Import multiple parties at once via CSV/Excel
router.post('/bulk-import',
    checkAccess('parties', 'bulkImport'),
    bulkImportParties
);

// POST /:id/image - Upload profile photos or business-related images
router.post('/:id/image',
    checkAccess('parties', 'create'),
    imageUpload.single('image'),
    uploadPartyImage
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Edit party contact information and business details
router.put('/:id',
    checkAccess('parties', 'update'),
    updateParty
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Remove party records from the database
router.delete('/:id',
    checkAccess('parties', 'delete'),
    deleteParty
);

// DELETE /:id/image - Permanently remove images from the party profile
router.delete('/:id/image',
    checkAccess('parties', 'deleteImage'),
    deletePartyImage
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Export the list of parties as a PDF document
// router.get('/export/pdf',
//     checkAccess('parties', 'exportPdf'),
//     exportPartiesPdf
// );

// GET /export/excel - Export party contact and data to an Excel spreadsheet
// router.get('/export/excel',
//     checkAccess('parties', 'exportExcel'),
//     exportPartiesExcel


// ============================================
// PARTY TYPE MANAGEMENT ROUTES
// ============================================
// POST /types - Create party type (all authenticated users)
router.post('/types', createPartyType);

// PUT /types/:id - Update party type (admin only)
router.put('/types/:id', requireOrgAdmin, updatePartyType);

// DELETE /types/:id - Delete party type (admin only)
router.delete('/types/:id', requireOrgAdmin, deletePartyType);

module.exports = router;
