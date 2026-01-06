// src/api/product/category/category.routes.js
// Product category routes - granular feature-based access control

const express = require('express');
const {
    getAllCategories
} = require('./category.controller');
const { protect } = require('../../../middlewares/auth.middleware');
const { checkAnyAccess } = require('../../../middlewares/compositeAccess.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// GET / - View product categories for dropdown selection
// Dependency: Users who can create or bulk-upload products also need to view categories
router.get(
    '/',
    checkAnyAccess([
        { module: 'products', feature: 'viewCategories' },
        { module: 'products', feature: 'create' },
        { module: 'products', feature: 'bulkUpload' }
    ]),
    getAllCategories
);

// ============================================
// FUTURE CATEGORY MANAGEMENT ROUTES
// ============================================
// POST / - Create new category
// router.post('/',
//     checkAnyAccess([
//         { module: 'products', feature: 'manageCategories' },
//         { module: 'products', feature: 'bulkUpload' }
//     ]),
//     createCategory
// );

// PUT /:id - Update category
// router.put('/:id',
//     checkAccess('products', 'manageCategories'),
//     updateCategory
// );

// DELETE /:id - Delete category
// router.delete('/:id',
//     checkAccess('products', 'manageCategories'),
//     deleteCategory
// );

module.exports = router;