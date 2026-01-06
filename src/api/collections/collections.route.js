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
    uploadChequeImage,
    deleteChequeImage,
} = require('./collections.controller');
const { protect, checkAccess } = require('../../middlewares/auth.middleware');

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
// GET /my-collections - View own collection entries
router.get('/my-collections',
    checkAccess('collections', 'view'),
    getMyCollections
);

// GET / - View all collection entries
router.get('/',
    checkAccess('collections', 'view'),
    getAllCollections
);

// GET /:id - View specific collection details
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

// POST /:id/cheque-images - Upload cheque image
router.post('/:id/cheque-images',
    checkAccess('collections', 'collectPayment'),
    imageUpload.single('chequeImage'),
    uploadChequeImage
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Update collection details
router.put('/:id',
    checkAccess('collections', 'verifyPayment'),
    updateCollection
);

// PATCH /:id/cheque-status - Update cheque status (cleared/bounced)
router.patch('/:id/cheque-status',
    checkAccess('collections', 'updateChequeStatus'),
    updateChequeStatus
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Delete collection entry
router.delete('/:id',
    checkAccess('collections', 'delete'),
    deleteCollection
);

// DELETE /bulk-delete - Bulk delete collection entries
router.delete('/bulk-delete',
    checkAccess('collections', 'delete'),
    bulkDeleteCollections
);

// DELETE /:id/cheque-images/:imageNumber - Delete cheque image
router.delete('/:id/cheque-images/:imageNumber',
    checkAccess('collections', 'delete'),
    deleteChequeImage
);

module.exports = router;
