// src/api/miscellaneous-work/miscellaneous.route.js
// Miscellaneous work routes - granular feature-based access control

const express = require('express');
const multer = require('multer');
const {
    createMiscellaneousWork,
    getAllMiscellaneousWork,
    getMyMiscellaneousWork,
    getMiscellaneousWorkById,
    updateMiscellaneousWork,
    deleteMiscellaneousWork,
    massBulkDeleteMiscellaneousWork,
    uploadMiscellaneousWorkImage,
    deleteMiscellaneousWorkImage,
    getMiscellaneousWorkImages
} = require('./miscellaneous.controller');
const { protect } = require('../../middlewares/auth.middleware');
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
// GET / - View all miscellaneous work entries (for admin/managers)
router.get('/',
    checkAccess('miscellaneousWork', 'viewList'),
    getAllMiscellaneousWork
);

// GET /my-work - View own miscellaneous work entries (for employees)
router.get('/my-work',
    checkAccess('miscellaneousWork', 'viewOwn'),
    getMyMiscellaneousWork
);

// GET /:id - View specific miscellaneous work entry details
// Users with viewList can view any, users with viewOwn can view their own
router.get('/:id',
    checkAnyAccess([
        { module: 'miscellaneousWork', feature: 'viewList' },
        { module: 'miscellaneousWork', feature: 'viewDetails' },
        { module: 'miscellaneousWork', feature: 'viewOwn' }
    ]),
    getMiscellaneousWorkById
);

// GET /:id/images - View images for a specific miscellaneous work entry
router.get('/:id/images',
    checkAnyAccess([
        { module: 'miscellaneousWork', feature: 'viewList' },
        { module: 'miscellaneousWork', feature: 'viewDetails' },
        { module: 'miscellaneousWork', feature: 'viewOwn' }
    ]),
    getMiscellaneousWorkImages
);

// ============================================
// CREATE OPERATION
// ============================================
// POST / - Create new miscellaneous work entry
router.post('/',
    checkAccess('miscellaneousWork', 'create'),
    createMiscellaneousWork
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Edit existing miscellaneous work entry
router.put('/:id',
    checkAccess('miscellaneousWork', 'update'),
    updateMiscellaneousWork
);

// POST /:id/images - Upload images to miscellaneous work entry
router.post('/:id/images',
    checkAccess('miscellaneousWork', 'create'),
    imageUpload.single('image'),
    uploadMiscellaneousWorkImage
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Delete specific miscellaneous work entry
router.delete('/:id',
    checkAccess('miscellaneousWork', 'delete'),
    deleteMiscellaneousWork
);

// DELETE /mass-delete - Bulk delete miscellaneous work entries
router.delete('/mass-delete',
    checkAccess('miscellaneousWork', 'bulkDelete'),
    massBulkDeleteMiscellaneousWork
);

// DELETE /:id/images/:imageNumber - Delete image from miscellaneous work entry
router.delete('/:id/images/:imageNumber',
    checkAccess('miscellaneousWork', 'update'),
    deleteMiscellaneousWorkImage
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Export miscellaneous work list as PDF
// router.get('/export/pdf',
//     checkAccess('miscellaneousWork', 'exportPdf'),
//     exportMiscellaneousWorkPdf
// );

// GET /export/excel - Export miscellaneous work data to Excel
// router.get('/export/excel',
//     checkAccess('miscellaneousWork', 'exportExcel'),
//     exportMiscellaneousWorkExcel
// );

module.exports = router;
