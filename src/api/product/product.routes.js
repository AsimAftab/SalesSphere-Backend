// src/api/product/product.routes.js
// Product management routes - granular feature-based access control

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
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess } = require('../../middlewares/compositeAccess.middleware');

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
// GET / - View the complete product catalog
router.get('/',
    checkAccess('products', 'viewList'),
    getAllProducts
);

// GET /:id - View detailed information about a specific product
router.get('/:id',
    checkAccess('products', 'viewDetails'),
    getProductById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Add new products to the inventory
router.post('/',
    checkAccess('products', 'create'),
    imageUpload.single('image'),
    createProduct
);

// POST /bulk-import - Import multiple products at once via CSV/Excel
// Note: This also auto-creates categories, so requires manageCategories access
router.post('/bulk-import',
    checkAccess('products', 'bulkUpload'),
    bulkImportProducts
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Edit existing product details and pricing
router.put('/:id',
    checkAccess('products', 'update'),
    imageUpload.single('image'),
    updateProduct
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Remove products from the system
router.delete('/:id',
    checkAccess('products', 'delete'),
    deleteProduct
);

// DELETE /bulk-delete - Perform mass deletion of selected products
router.delete('/bulk-delete',
    checkAccess('products', 'bulkDelete'),
    bulkDeleteProducts
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Generate and download product list as PDF
// router.get('/export/pdf',
//     checkAccess('products', 'exportPdf'),
//     exportProductsPdf
// );

// GET /export/excel - Export product data to Excel
// router.get('/export/excel',
//     checkAccess('products', 'exportExcel'),
//     exportProductsExcel
// );

module.exports = router;