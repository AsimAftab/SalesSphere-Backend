// src/api/invoice/invoice.route.js
// Invoice and estimate routes - permission-based access

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
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// ESTIMATE ROUTES
// ============================================

// VIEW
router.get('/estimates', requirePermission('orderLists', 'view'), getAllEstimates);
router.get('/estimates/:id', requirePermission('orderLists', 'view'), getEstimateById);

// ADD
router.post('/estimates', requirePermission('orderLists', 'add'), createEstimate);
router.post('/estimates/:id/convert', requirePermission('orderLists', 'add'), convertEstimateToInvoice);

// DELETE
router.delete('/estimates/:id', requirePermission('orderLists', 'delete'), deleteEstimate);
router.delete('/estimates/bulk-delete', requirePermission('orderLists', 'delete'), bulkDeleteEstimates);

// ============================================
// INVOICE ROUTES
// ============================================

// VIEW
router.get('/parties/stats', requirePermission('orderLists', 'view'), getPartiesOrderStats);
router.get('/parties/:partyId/stats', requirePermission('orderLists', 'view'), getPartyOrderStats);
router.get('/', requirePermission('orderLists', 'view'), getAllInvoices);
router.get('/:id', requirePermission('orderLists', 'view'), getInvoiceById);

// ADD
router.post('/', requirePermission('orderLists', 'add'), createInvoice);

// UPDATE
router.put('/:id/status', requirePermission('orderLists', 'update'), updateInvoiceStatus);

module.exports = router;
