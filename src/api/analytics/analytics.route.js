const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const {
    getMonthlyOverview,
    getSalesTrend,
    getProductsByCategory,
    getTopProducts,
    getTopParties
} = require('./analytics.controller');

// All routes require authentication and admin/manager authorization
router.use(protect);
router.use(restrictTo('admin', 'manager'));

// @route   GET /api/v1/analytics/monthly-overview
// @desc    Get monthly analytics overview (Total Order Value, Total Orders)
// @query   month=11&year=2025
router.get('/monthly-overview', getMonthlyOverview);

// @route   GET /api/v1/analytics/sales-trend
// @desc    Get sales trend by week for selected month
// @query   month=11&year=2025
router.get('/sales-trend', getSalesTrend);

// @route   GET /api/v1/analytics/products-by-category
// @desc    Get products sold by category for selected month
// @query   month=11&year=2025
router.get('/products-by-category', getProductsByCategory);

// @route   GET /api/v1/analytics/top-products
// @desc    Get top 10 products sold for selected month
// @query   month=11&year=2025
router.get('/top-products', getTopProducts);

// @route   GET /api/v1/analytics/top-parties
// @desc    Get top 5 parties of the month
// @query   month=11&year=2025
router.get('/top-parties', getTopParties);

module.exports = router;
