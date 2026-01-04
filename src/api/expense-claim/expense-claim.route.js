// src/api/expense-claim/expense-claim.route.js
// Expense claim routes - permission-based access

const express = require('express');
const multer = require('multer');
const {
    createExpenseClaim,
    getAllExpenseClaims,
    getExpenseClaimById,
    updateExpenseClaim,
    deleteExpenseClaim,
    updateExpenseClaimStatus,
    bulkDeleteExpenseClaims,
    createExpenseCategory,
    getExpenseCategories,
    updateExpenseCategory,
    deleteExpenseCategory,
    uploadReceipt,
    deleteReceipt,
} = require('./expense-claim.controller');
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
// CATEGORY ROUTES
// ============================================
router.get('/categories', requirePermission('expenses', 'view'), getExpenseCategories);
router.post('/categories', requirePermission('expenses', 'add'), createExpenseCategory);
router.put('/categories/:id', requirePermission('expenses', 'update'), updateExpenseCategory);
router.delete('/categories/:id', requirePermission('expenses', 'delete'), deleteExpenseCategory);

// ============================================
// EXPENSE CLAIM ROUTES
// ============================================

// VIEW
router.get('/', requirePermission('expenses', 'view'), getAllExpenseClaims);
router.get('/:id', requirePermission('expenses', 'view'), getExpenseClaimById);

// ADD
router.post('/', requirePermission('expenses', 'add'), createExpenseClaim);
router.post('/:id/receipt', requirePermission('expenses', 'add'), imageUpload.single('receipt'), uploadReceipt);

// UPDATE
router.put('/:id', requirePermission('expenses', 'update'), updateExpenseClaim);
router.put('/:id/status', requirePermission('expenses', 'update'), updateExpenseClaimStatus);

// DELETE
router.delete('/:id', requirePermission('expenses', 'delete'), deleteExpenseClaim);
router.delete('/bulk-delete', requirePermission('expenses', 'delete'), bulkDeleteExpenseClaims);
router.delete('/:id/receipt', requirePermission('expenses', 'delete'), deleteReceipt);

module.exports = router;
