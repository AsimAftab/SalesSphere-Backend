const express = require('express');
const {
    createInvoice,
    getAllInvoices,
    getInvoiceById,
    deleteInvoice,
    updateInvoiceStatus,
    getPartiesOrderStats,
    getPartyOrderStats,
    // Estimate endpoints
    createEstimate,
    getAllEstimates,
    getEstimateById,
    deleteEstimate,
    bulkDeleteEstimates,
    convertEstimateToInvoice
} = require('./invoice.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// ============================================
// ESTIMATE ROUTES (must come before /:id routes)
// ============================================

// Create a new estimate
router.post(
    '/estimates',
    restrictTo('admin', 'manager', 'salesperson'),
    createEstimate
);

// Get all estimates
router.get(
    '/estimates',
    getAllEstimates
);

// Get a single estimate by ID
router.get(
    '/estimates/:id',
    getEstimateById
);

// Bulk delete estimates (must come before /:id route)
router.delete(
    '/estimates/bulk-delete',
    restrictTo('admin', 'manager'),
    bulkDeleteEstimates
);

// Delete an estimate
router.delete(
    '/estimates/:id',
    restrictTo('admin', 'manager', 'salesperson'),
    deleteEstimate
);

// Convert estimate to invoice
router.post(
    '/estimates/:id/convert',
    restrictTo('admin', 'manager', 'salesperson'),
    convertEstimateToInvoice
);

// ============================================
// INVOICE ROUTES
// ============================================

// Get aggregated order statistics for all parties
router.get(
    '/parties/stats',
    getPartiesOrderStats
);

// Get aggregated order statistics for a specific party
router.get(
    '/parties/:partyId/stats',
    getPartyOrderStats
);

// Create a new invoice
router.post(
    '/',
    restrictTo('admin', 'manager', 'salesperson'),
    createInvoice
);

// Get all invoices (filtered by role)
router.get(
    '/',
    getAllInvoices
);

// Get a single invoice by ID (filtered by role)
router.get(
    '/:id',
    getInvoiceById
);

// Update an invoice's status
router.put(
    '/:id/status',
    restrictTo('admin', 'manager'),
    updateInvoiceStatus
);

module.exports = router;
