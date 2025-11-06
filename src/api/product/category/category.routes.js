const express = require('express');
const {
    getAllCategories
} = require('./category.controller');
const { protect} = require('../../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// Get all categories (for the dropdown)
router.get(
    '/',
    getAllCategories
);

module.exports = router;