// src/api/expense-claim/expense-claim.route.js
// Expense claim routes - granular feature-based access control (Option 3: Separate Keys)

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
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

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
// EXPENSE CATEGORY ROUTES (Separate Features)
// ============================================
// GET /categories - View expense categories
// Users with viewCategories OR create permission can view
router.get('/categories',
    checkAnyAccess([
        { module: 'expenses', feature: 'viewCategories' },
        { module: 'expenses', feature: 'create' }  // If you can create expenses, you need to see categories
    ]),
    getExpenseCategories
);

// POST /categories - Create new expense category
router.post('/categories',
    checkAccess('expenses', 'createCategory'),
    createExpenseCategory
);

// PUT /categories/:id - Update expense category
router.put('/categories/:id',
    checkAccess('expenses', 'updateCategory'),
    updateExpenseCategory
);

// DELETE /categories/:id - Delete expense category
router.delete('/categories/:id',
    checkAccess('expenses', 'deleteCategory'),
    deleteExpenseCategory
);

// ============================================
// EXPENSE CLAIM ROUTES
// ============================================

// VIEW
// GET / - View list of all expense claims
router.get('/',
    checkAccess('expenses', 'viewList'),
    getAllExpenseClaims
);

// GET /:id - View detailed expense claim (receipts, approval history)
router.get('/:id',
    checkAccess('expenses', 'viewDetails'),
    getExpenseClaimById
);

// CREATE
// POST / - Create new expense claim
router.post('/',
    checkAccess('expenses', 'create'),
    createExpenseClaim
);

// POST /:id/receipt - Upload receipt for expense claim
router.post('/:id/receipt',
    checkAccess('expenses', 'uploadReceipt'),
    imageUpload.single('receipt'),
    uploadReceipt
);

// UPDATE
// PUT /:id - Update expense claim details (also auto-creates category if new)
router.put('/:id',
    checkAccess('expenses', 'update'),
    updateExpenseClaim
);

// PUT /:id/status - Approve/reject/mark reimbursed (admin/supervisor only)
router.put('/:id/status',
    checkAccess('expenses', 'updateStatus'),
    updateExpenseClaimStatus
);

// DELETE
// DELETE /:id - Delete expense claim
router.delete('/:id',
    checkAccess('expenses', 'delete'),
    deleteExpenseClaim
);

// DELETE /bulk-delete - Bulk delete expense claims
router.delete('/bulk-delete',
    checkAccess('expenses', 'bulkDelete'),
    bulkDeleteExpenseClaims
);

// DELETE /:id/receipt - Delete receipt from expense claim
router.delete('/:id/receipt',
    checkAccess('expenses', 'delete'),
    deleteReceipt
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Export expense claims as PDF
// router.get('/export/pdf',
//     checkAccess('expenses', 'exportPdf'),
//     exportExpensesPdf
// );

// GET /export/excel - Export expense claims as Excel
// router.get('/export/excel',
//     checkAccess('expenses', 'exportExcel'),
//     exportExpensesExcel
// );

module.exports = router;
