const express = require('express');
const {
    createParty,
    getAllParties,
    getPartyById,
    updateParty,
    deleteParty // Changed back to deleteParty for hard delete
} = require('./party.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes in this file
router.use(protect);

// Create a party - Admin, Manager, and Salesperson
router.post(
    '/',
    restrictTo('admin', 'manager', 'salesperson'),
    createParty
);

// Get all parties (list view) - Available to all roles
router.get(
    '/',
    getAllParties
);

// Get single party (detail view) - Available to all roles
router.get(
    '/:id',
    getPartyById
);

// Update a party - Admin, Manager, and Salesperson
router.put(
    '/:id',
    restrictTo('admin', 'manager', 'salesperson'),
    updateParty
);

// --- MODIFIED ROUTE ---
// Permanently delete a party - Admin, Manager
router.delete(
    '/:id',
    restrictTo('admin', 'manager'),
    deleteParty // Use the deleteParty controller function
);
// --- END MODIFICATION ---

module.exports = router;

