// src/api/collections/collections.route.js
// Collections routes - permission-based access

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
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

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
router.get('/my-collections', requirePermission('collections', 'view'), getMyCollections);
router.get('/', requirePermission('collections', 'view'), getAllCollections);
router.get('/:id', requirePermission('collections', 'view'), getCollectionById);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('collections', 'add'), createCollection);
router.post('/:id/cheque-images', requirePermission('collections', 'add'), imageUpload.single('chequeImage'), uploadChequeImage);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.put('/:id', requirePermission('collections', 'update'), updateCollection);
router.patch('/:id/cheque-status', requirePermission('collections', 'update'), updateChequeStatus);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('collections', 'delete'), deleteCollection);
router.delete('/bulk-delete', requirePermission('collections', 'delete'), bulkDeleteCollections);
router.delete('/:id/cheque-images/:imageNumber', requirePermission('collections', 'delete'), deleteChequeImage);

module.exports = router;
