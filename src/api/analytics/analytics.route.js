// src/api/analytics/analytics.route.js
// Analytics routes - permission-based access

const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middlewares/auth.middleware');
const {
    getMonthlyOverview,
    getSalesTrend,
    getProductsByCategory,
    getTopProducts,
    getTopParties
} = require('./analytics.controller');

router.use(protect);

// All analytics routes require analytics.view permission
router.get('/monthly-overview', requirePermission('analytics', 'view'), getMonthlyOverview);
router.get('/sales-trend', requirePermission('analytics', 'view'), getSalesTrend);
router.get('/products-by-category', requirePermission('analytics', 'view'), getProductsByCategory);
router.get('/top-products', requirePermission('analytics', 'view'), getTopProducts);
router.get('/top-parties', requirePermission('analytics', 'view'), getTopParties);

module.exports = router;
