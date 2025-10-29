const express = require('express');
const {
    createOrder,
    getAllOrders,
    getOrderById,
    updateOrderStatus
} = require('./order.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes in this file
router.use(protect);

// --- Base Route ---
router.route('/')
    // Get all orders (with filtering)
    .get(getAllOrders) 
    // Create an order (from app)
    .post(
        restrictTo('salesperson'), 
        createOrder
    );

// --- Specific Order Route ---
router.route('/:id')
    // Get a single order's details
    .get(getOrderById);

// --- Specific Status Update Route ---
// (e.g., PUT /api/v1/orders/123abc.../status)
router.put(
    '/:id/status',
    restrictTo('admin', 'manager'), // Only web roles can change status
    updateOrderStatus
);

module.exports = router;