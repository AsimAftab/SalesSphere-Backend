// src/api/analytics/analytics.route.js
// Analytics routes - granular feature-based access control

const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess } = require('../../middlewares/compositeAccess.middleware');
const {
    getMonthlyOverview,
    getSalesTrend,
    getProductsByCategory,
    getTopProducts,
    getTopParties
} = require('./analytics.controller');

router.use(protect);

// ============================================
// ANALYTICS REPORTS
// ============================================
// GET /monthly-overview - View month-over-month performance summaries and KPIs
router.get('/monthly-overview',
    checkAccess('analytics', 'viewMonthlyOverview'),
    getMonthlyOverview
);

// GET /sales-trend - Access detailed revenue charts and growth trends
router.get('/sales-trend',
    checkAccess('analytics', 'viewSalesTrend'),
    getSalesTrend
);

// GET /products-by-category - View breakdown of products sold by specific categories
router.get('/products-by-category',
    checkAccess('analytics', 'viewCategorySales'),
    getProductsByCategory
);

// GET /top-products - Analyze the highest performing products by volume and value
router.get('/top-products',
    checkAccess('analytics', 'viewTopProducts'),
    getTopProducts
);

// GET /top-parties - Identify and view the top 5 customers/parties of the month
router.get('/top-parties',
    checkAccess('analytics', 'viewTopParties'),
    getTopParties
);

module.exports = router;
