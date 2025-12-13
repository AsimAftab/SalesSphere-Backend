const express = require('express');
const multer = require('multer'); // Import multer
const {
    createProspect,
    getAllProspects,
    getProspectById,
    updateProspect,
    deleteProspect,
    transferToParty,
    getAllProspectsDetails,
    uploadProspectImage, // Import new controller function
    deleteProspectImage  // Import new controller function
} = require('./prospect.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// --- Configure multer for prospect images ---
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

// Get all prospects for logged-in user's organization
router.get(
    '/details',
    getAllProspectsDetails
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
    deleteProspect
);

// Transfer a prospect to a party - Admin, Manager, Salesperson
router.post(
    '/:id/transfer',
    restrictTo('admin', 'manager'),
    transferToParty
);

// --- NEW IMAGE ROUTES ---

// Upload or update a prospect image
router.post(
    '/:id/images',
    restrictTo('admin', 'manager', 'salesperson'), // Assuming salespersons can also upload images
    imageUpload.single('image'),
    uploadProspectImage
);

// Delete a prospect image
router.delete(
    '/:id/images/:imageNumber',
    restrictTo('admin', 'manager', 'salesperson'),
    deleteProspectImage
);

module.exports = router;