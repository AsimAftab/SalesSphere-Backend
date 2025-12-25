const express = require('express');
const {
    createParty,
    getAllParties,
    getAllPartiesDetails,
    getPartyById,
    updateParty,
    deleteParty, // Use the deleteParty controller function
    uploadPartyImage, // Import new controller
    deletePartyImage, // Import new controller
    bulkImportParties, // Bulk import controller
    getPartyTypes // Party types controller
} = require('./party.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const multer = require('multer');

const router = express.Router();

// Configure multer for party images
const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files up to 5MB are allowed!'), false);
        }
    }
});

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

// Get all parties for logged-in user's organization
router.get(
    '/details',
    getAllPartiesDetails
);

// Get all party types - Available to all roles
router.get(
    '/types',
    getPartyTypes
);

// Bulk import parties - Admin, Manager
router.post(
    '/bulk-import',
    restrictTo('admin', 'manager'),
    bulkImportParties
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

// Upload or update a party image - Admin, Manager, Salesperson
router.post(
    '/:id/image',
    restrictTo('admin', 'manager', 'salesperson'),
    imageUpload.single('image'),
    uploadPartyImage
);

// Delete a party image - Admin, Manager
router.delete(
    '/:id/image',
    restrictTo('admin', 'manager'),
    deletePartyImage
);

module.exports = router;

