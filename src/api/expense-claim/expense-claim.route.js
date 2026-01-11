// src/api/expense-claim/expense-claim.route.js
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
const { checkAccess, checkAnyAccess, requireOrgAdmin } = require('../../middlewares/compositeAccess.middleware');

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
// EXPENSE CATEGORY ROUTES
// ============================================

// GET /categories - View expense categories
// ✅ OPEN to all authenticated users. 
// Auditors need this to filter lists; Filers need this to pick categories.
router.get('/categories', getExpenseCategories);

// POST /categories - Create new expense category
// ✅ SECURED: Only users who can create expenses can add categories.
// Prevents random API spam from non-expense users.
router.post('/categories',
    checkAccess('expenses', 'create'),
    createExpenseCategory
);

// PUT & DELETE - Update/Delete expense category
// ✅ LOCKED: Only Admins can rename/delete to prevent data corruption.
router.put('/categories/:id', requireOrgAdmin(), updateExpenseCategory);
router.delete('/categories/:id', requireOrgAdmin(), deleteExpenseCategory);


// ============================================
// EXPENSE CLAIM ROUTES
// ============================================

// VIEW
router.get('/', checkAccess('expenses', 'viewList'), getAllExpenseClaims);
router.get('/:id', checkAccess('expenses', 'viewDetails'), getExpenseClaimById);

// CREATE
router.post('/', checkAccess('expenses', 'create'), createExpenseClaim);

// UPLOAD RECEIPT

router.post('/:id/receipt',
    checkAnyAccess([
        { module: 'expenses', feature: 'create' }, // For initial upload workflow
        { module: 'expenses', feature: 'update' }  // For corrections later
    ]),
    imageUpload.single('receipt'),
    uploadReceipt
);

// UPDATE
router.put('/:id/status', checkAccess('expenses', 'updateStatus'), updateExpenseClaimStatus);
router.put('/:id', checkAccess('expenses', 'update'), updateExpenseClaim);

// DELETE
router.delete('/bulk-delete', checkAccess('expenses', 'bulkDelete'), bulkDeleteExpenseClaims);
router.delete('/:id/receipt', checkAccess('expenses', 'delete'), deleteReceipt);
router.delete('/:id', checkAccess('expenses', 'delete'), deleteExpenseClaim);

module.exports = router;