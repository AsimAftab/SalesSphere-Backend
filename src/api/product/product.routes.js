// src/api/product/product.routes.js
// Product management routes - permission-based access

const express = require('express');
const multer = require('multer');
const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    bulkDeleteProducts,
    bulkImportProducts
} = require('./product.controller');
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/', requirePermission('products', 'view'), getAllProducts);
router.get('/:id', requirePermission('products', 'view'), getProductById);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('products', 'add'), imageUpload.single('image'), createProduct);
router.post('/bulk-import', requirePermission('products', 'add'), bulkImportProducts);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.put('/:id', requirePermission('products', 'update'), imageUpload.single('image'), updateProduct);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('products', 'delete'), deleteProduct);
router.delete('/bulk-delete', requirePermission('products', 'delete'), bulkDeleteProducts);

module.exports = router;