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
    uploadChequeImage,
    deleteChequeImage,
} = require('./collections.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// --- Configure multer for cheque images ---
const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files up to 5MB are allowed!'), false);
        }
    }
});

// Apply 'protect' middleware to all routes
router.use(protect);

// ============================================
// SPECIALIZED ROUTES (must come before /:id)
// ============================================

// Bulk delete collections
router.delete(
    '/bulk-delete',
    restrictTo('admin'),
    bulkDeleteCollections
);

// Get my collections
router.get(
    '/my-collections',
    getMyCollections
);

// ============================================
// COLLECTION ROUTES
// ============================================

// Create a new collection
router.post(
    '/',
    createCollection
);

// Get all collections
router.get(
    '/',
    restrictTo('admin', 'manager'),
    getAllCollections
);

// Get a single collection by ID
router.get(
    '/:id',
    getCollectionById
);

// Update a collection
router.put(
    '/:id',
    updateCollection
);

// Delete a collection
router.delete(
    '/:id',
    restrictTo('admin'),
    deleteCollection
);

// ============================================
// CHEQUE SPECIFIC ROUTES
// ============================================

// Update cheque status (approve/reject cheque)
router.patch(
    '/:id/cheque-status',
    restrictTo('admin', 'manager', 'salesperson'),
    updateChequeStatus
);

// Upload a cheque image (send imageNumber: 1 or 2 in form-data body)
router.post(
    '/:id/cheque-images',
    imageUpload.single('chequeImage'),
    uploadChequeImage
);

// Delete a cheque image by imageNumber (1 or 2)
router.delete(
    '/:id/cheque-images/:imageNumber',
    deleteChequeImage
);

module.exports = router;
