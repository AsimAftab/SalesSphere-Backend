// src/api/collections/collections.route.js
// Collections routes - granular feature-based access control

const express = require('express');
const multer = require('multer');
const {
    createCollection,
    getAllCollections,
    getMyCollections,
    getCollectionById,
    updateCollection,
    updateChequeStatus,
    deleteCollection,
    bulkDeleteCollections,
    uploadCollectionImage,
    deleteCollectionImage,
    getBankNames,
    updateBankName,
    deleteBankName,
} = require('./collections.controller');
const { protect, checkAccess, requireOrgAdmin } = require('../../middlewares/auth.middleware');

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

router.use(protect); // Replaced verifyToken with protect

// ============================================
// VIEW OPERATIONS
// ============================================
// @route   GET /api/v1/collections/utils/bank-names
// @access  Private (All authenticated users for dropdown)
router.get('/utils/bank-names',
    checkAccess('collections', 'view'),
    getBankNames
);

// @route   PUT /api/v1/collections/utils/bank-names/:id
// @access  Private (Org Admin only)
router.put('/utils/bank-names/:id',
    requireOrgAdmin(),
    updateBankName
);

// @route   DELETE /api/v1/collections/utils/bank-names/:id
// @access  Private (Org Admin only)
router.delete('/utils/bank-names/:id',
    requireOrgAdmin(),
    deleteBankName
);

// @route   GET /api/v1/collections/my-collections
// @access  Private
router.get('/my-collections',
    getMyCollections
);

// GET / - View all collection entries
router.get('/',
    checkAccess('collections', 'view'),
    getAllCollections
);

// @route   GET /api/v1/collections/:id
// @access  Private
router.get('/:id',
    checkAccess('collections', 'view'),
    getCollectionById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Add new payment collection entry
router.post('/',
    checkAccess('collections', 'collectPayment'),
    createCollection
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// @route   PUT /api/v1/collections/:id
// @access  Private
router.put('/:id',
    checkAccess('collections', 'collectPayment'), // Changed permission from verifyPayment
    updateCollection
);

// @route   PATCH /api/v1/collections/:id/cheque-status
// @access  Private (Admin, Manager)
router.patch('/:id/cheque-status',
    checkAccess('collections', 'updateChequeStatus'),
    updateChequeStatus
);

// ============================================
// IMAGE ROUTES (Generic)
// ============================================

// @route   POST /api/v1/collections/:id/images
// @access  Private
router.post('/:id/images', // Renamed from /cheque-images
    checkAccess('collections', 'collectPayment'), // Creating requires collect permission
    imageUpload.single('image'), // Renamed imageUpload to upload, chequeImage to image
    uploadCollectionImage // Renamed from uploadChequeImage
);

// @route   DELETE /api/v1/collections/:id/images/:imageNumber
// @access  Private
router.delete('/:id/images/:imageNumber', // Renamed from /cheque-images
    checkAccess('collections', 'collectPayment'), // Using same permission as upload/update
    deleteCollectionImage // Renamed from deleteChequeImage
);

// ============================================
// DELETE OPERATIONS
// ============================================

// DELETE /bulk-delete - Bulk delete collection entries
router.delete('/bulk-delete',
    checkAccess('collections', 'delete'),
    bulkDeleteCollections
);

// DELETE /:id - Delete collection entry
router.delete('/:id',
    checkAccess('collections', 'delete'),
    deleteCollection
);


module.exports = router;
