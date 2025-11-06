const express = require('express');
const multer = require('multer');
const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct
} = require('./product.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// --- Multer Configuration ---
// Configure multer for product images
const imageUpload = multer({
    dest: 'tmp/', // Temporary folder for uploads
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Apply 'protect' middleware to all routes
router.use(protect);

// --- Product CRUD Routes ---

// Create a product
// Now uses multer to handle image upload
router.post(
    '/',
    restrictTo('admin', 'manager'),
    imageUpload.single('image'), // Field name from form-data must be 'image'
    createProduct
);

// Get all active products
router.get(
    '/',
    getAllProducts
);

// Get a single product by ID
router.get(
    '/:id',
    getProductById
);

// Update a product
// Also uses multer in case the image is being replaced
router.put(
    '/:id',
    restrictTo('admin', 'manager'),
    imageUpload.single('image'), // Field name from form-data must be 'image'
    updateProduct
);

// Deactivate (soft delete) a product
router.delete(
    '/:id',
    restrictTo('admin', 'manager'),
    deleteProduct
);

module.exports = router;