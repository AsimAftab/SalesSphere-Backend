// src/api/invoice/invoice.route.js
// Invoice and estimate routes - granular feature-based access control

const express = require('express');
const {
    createInvoice,
    getAllInvoices,
    getInvoiceById,
    deleteInvoice,
    updateInvoiceStatus,
    getPartiesOrderStats,
    getPartyOrderStats,
    createEstimate,
    getAllEstimates,
    getEstimateById,
    deleteEstimate,
    bulkDeleteEstimates,
    convertEstimateToInvoice
} = require('./invoice.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess } = require('../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// ESTIMATE ROUTES
// ============================================

// VIEW
// GET /estimates - View all generated price estimates and quotes
router.get('/estimates',
    checkAccess('estimates', 'viewList'),
    getAllEstimates
);

// GET /estimates/:id - Access detailed breakdown and items within an estimate
router.get('/estimates/:id',
    checkAccess('estimates', 'viewDetails'),
    getEstimateById
);

// CREATE
// POST /estimates - Create new price estimates for potential customers
router.post('/estimates',
    checkAccess('estimates', 'create'),
    createEstimate
);

// POST /estimates/:id/convert - Convert approved estimate to invoice
router.post('/estimates/:id/convert',
    checkAccess('estimates', 'convertToInvoice'),
    convertEstimateToInvoice
);

// DELETE
// DELETE /estimates/:id - Delete individual estimate
router.delete('/estimates/:id',
    checkAccess('estimates', 'delete'),
    deleteEstimate
);

// DELETE /estimates/bulk-delete - Remove multiple estimate records simultaneously
router.delete('/estimates/bulk-delete',
    checkAccess('estimates', 'bulkDelete'),
    bulkDeleteEstimates
);

// ============================================
// INVOICE ROUTES
// ============================================

// VIEW
// GET /parties/stats - View order statistics by party (all parties)
router.get('/parties/stats',
    checkAccess('invoices', 'viewPartyStats'),
    getPartiesOrderStats
);

// GET /parties/:partyId/stats - View order statistics for specific party
router.get('/parties/:partyId/stats',
    checkAccess('invoices', 'viewPartyStats'),
    getPartyOrderStats
);

// GET / - View all customer orders and their current status
router.get('/',
    checkAccess('invoices', 'viewList'),
    getAllInvoices
);

// GET /:id - Access deep-dive information for specific orders
router.get('/:id',
    checkAccess('invoices', 'viewDetails'),
    getInvoiceById
);

// CREATE
// POST / - Generate new customer invoices
router.post('/',
    checkAccess('invoices', 'create'),
    createInvoice
);

// UPDATE
// PUT /:id/status - Modify invoice status (e.g., Pending, Shipped, Delivered)
router.put('/:id/status',
    checkAccess('invoices', 'updateStatus'),
    updateInvoiceStatus
);

module.exports = router;
