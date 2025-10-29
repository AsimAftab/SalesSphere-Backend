const express = require('express');
const {
    createParty,
    getAllParties,
    getPartyById,
    updateParty,
    deleteParty
} = require('./party.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes in this file
// This ensures only logged-in users can access any party endpoint
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
    getAllParties // This should be getAllParties
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

// Delete a party - Admin, Manager, and Salesperson
router.delete(
    '/:id',
    restrictTo('admin', 'manager', 'salesperson'),
    deleteParty
);

module.exports = router;


