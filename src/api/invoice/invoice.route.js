const express = require('express');
const {
    createInvoice,
    getAllInvoices,
    getInvoiceById,
    deleteInvoice,
    updateInvoiceStatus,
    getPartiesOrderStats,
    getPartyOrderStats
} = require('./invoice.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes
router.use(protect);

// --- Invoice CRUD Routes ---

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

// // Delete an invoice (and restock items)
// router.delete(
//     '/:id',
//     restrictTo('admin', 'manager'),
//     deleteInvoice
// );

// --- NEW ROUTE ---
// Update an invoice's status
router.put(
    '/:id/status',
    restrictTo('admin', 'manager'),
    updateInvoiceStatus // <-- 2. Add new route
);
// --- END NEW ROUTE ---

module.exports = router;