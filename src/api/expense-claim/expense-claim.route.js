const express = require('express');
const multer = require('multer');
const {
    // Expense Claim endpoints
    createExpenseClaim,
    getAllExpenseClaims,
    getExpenseClaimById,
    updateExpenseClaim,
    deleteExpenseClaim,
    updateExpenseClaimStatus,
    bulkDeleteExpenseClaims,
    // Category endpoints
    createExpenseCategory,
    getExpenseCategories,
    updateExpenseCategory,
    deleteExpenseCategory,
    // Receipt endpoints
    uploadReceipt,
    deleteReceipt,
} = require('./expense-claim.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// --- Configure multer for receipt images ---
const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
// CATEGORY ROUTES (must come before /:id routes)
// ============================================

// Create a new expense category
router.post(
    '/categories',
    restrictTo('admin', 'manager'),
    createExpenseCategory
);

// Get all expense categories
router.get(
    '/categories',
    getExpenseCategories
);

// Update an expense category
router.put(
    '/categories/:id',
    restrictTo('admin', 'manager'),
    updateExpenseCategory
);

// Delete an expense category
router.delete(
    '/categories/:id',
    restrictTo('admin', 'manager'),
    deleteExpenseCategory
);

// ============================================
// EXPENSE CLAIM ROUTES
// ============================================

// Bulk delete expense claims (must come before /:id route)
router.delete(
    '/bulk-delete',
    restrictTo('admin', 'manager'),
    bulkDeleteExpenseClaims
);

// Create a new expense claim
router.post(
    '/',
    createExpenseClaim
);

// Get all expense claims
router.get(
    '/',
    getAllExpenseClaims
);

// Get a single expense claim by ID
router.get(
    '/:id',
    getExpenseClaimById
);

// Update an expense claim
router.put(
    '/:id',
    updateExpenseClaim
);

// Delete an expense claim
router.delete(
    '/:id',
    deleteExpenseClaim
);

// Update expense claim status (approve/reject)
router.put(
    '/:id/status',
    restrictTo('admin', 'manager'),
    updateExpenseClaimStatus
);

// ============================================
// RECEIPT ROUTES
// ============================================

// Upload receipt for an expense claim
router.post(
    '/:id/receipt',
    imageUpload.single('receipt'),
    uploadReceipt
);

// Delete receipt from an expense claim
router.delete(
    '/:id/receipt',
    deleteReceipt
);

module.exports = router;
