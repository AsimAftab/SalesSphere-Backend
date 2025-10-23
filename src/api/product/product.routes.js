const express = require('express');
const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    bulkUpdateProducts,
    decreaseProductStock
} = require('./product.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes in this file
// This ensures only logged-in users can access any product endpoint
router.use(protect);

// --- Custom Bulk Routes ---

// Matches 'bulkUpdateProducts' - Admin/Manager only
router.post(
    '/bulk-update',
    restrictTo('admin', 'manager'),
    bulkUpdateProducts
);

// Matches 'decreaseProductStock' - Available to all roles (e.g., for placing orders)
router.post(
    '/decrease-stock',
    decreaseProductStock
);

// --- Standard CRUD Routes ---

// Create a product - Admin/Manager only
router.post(
    '/',
    restrictTo('admin', 'manager'),
    createProduct
);

// Get all products - Available to all roles
router.get(
    '/',
    getAllProducts
);

// Get single product - Available to all roles
router.get(
    '/:id',
    getProductById
);

// Update a product - Admin/Manager only
router.put(
    '/:id',
    restrictTo('admin', 'manager'),
    updateProduct
);

// Delete a product - Admin/Manager only
router.delete(
    '/:id',
    restrictTo('admin', 'manager'),
    deleteProduct
);

module.exports = router;

