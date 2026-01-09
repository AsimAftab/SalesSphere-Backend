// src/api/product/category/category.routes.js
// Product category routes

const express = require('express');
const {
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('./category.controller');
const { protect, requireOrgAdmin } = require('../../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// GET / - View product categories (all authenticated users)
router.get('/', getAllCategories);

// POST / - Create new category (all authenticated users)
router.post('/', createCategory);

// PUT /:id - Update category (admin only)
router.put('/:id', requireOrgAdmin, updateCategory);

// DELETE /:id - Delete category (admin only)
router.delete('/:id', requireOrgAdmin, deleteCategory);

module.exports = router;