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
    getPartyTypes
} = require('./party.controller');
const { protect } = require('../../middlewares/auth.middleware');
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

// GET /types - View available party types for categorization
// Dependency: Users who can create parties also need to view/implicitly create types
router.get('/types',
    checkAnyAccess([
        { module: 'parties', feature: 'viewTypes' },
        { module: 'parties', feature: 'create' }
    ]),
    getPartyTypes
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
    checkAccess('parties', 'uploadImage'),
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
// );

// ============================================
// PARTY TYPE MANAGEMENT ROUTES (Future)
// ============================================
// Note: Party types are auto-created via syncPartyType when creating parties
// Users with 'create' permission can implicitly create party types
// For explicit type management routes, use:
// POST /types - Create party type
// router.post('/types',
//     checkAnyAccess([
//         { module: 'parties', feature: 'manageTypes' },
//         { module: 'parties', feature: 'create' }  // Implicit: can create types via party creation
//     ]),
//     createPartyType
// );

// PUT /types/:id - Update party type
// router.put('/types/:id',
//     checkAccess('parties', 'manageTypes'),
//     updatePartyType
// );

// DELETE /types/:id - Delete party type
// router.delete('/types/:id',
//     checkAccess('parties', 'manageTypes'),
//     deletePartyType
// );

module.exports = router;
