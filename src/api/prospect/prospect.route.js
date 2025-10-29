const express = require('express');
const {
    createProspect,
    getAllProspects,
    getProspectById,
    updateProspect,
    deleteProspect,
    transferToParty
} = require('./prospect.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply 'protect' middleware to all routes in this file
router.use(protect);

// Create a prospect - Admin, Manager, and Salesperson
router.post(
    '/',
    restrictTo('admin', 'manager', 'salesperson'),
    createProspect
);

// Get all prospects (list view) - Available to all roles
router.get(
    '/',
    getAllProspects
);

// Get single prospect (detail view) - Available to all roles
router.get(
    '/:id',
    getProspectById
);

// Update a prospect - Admin, Manager, and Salesperson
router.put(
    '/:id',
    restrictTo('admin', 'manager', 'salesperson'),
    updateProspect
);


// Permanently delete a prospect - Admin, Manager
router.delete(
    '/:id',
    restrictTo('admin', 'manager'),
    deleteProspect // Use the deleteProspect controller function
);

// Transfer a prospect to a party - Admin, Manager, Salesperson
router.post(
    '/:id/transfer', // <-- Added this route
    restrictTo('admin', 'manager'),
    transferToParty // <-- Added this controller function
);

module.exports = router;

