const express = require('express');
const multer = require('multer');
const {
    createSite,
    getAllSites,
    getAllSitesDetails,
    getSiteById,
    updateSite,
    deleteSite,
    uploadSiteImage,
    deleteSiteImage,
    getSiteCategories,
    getSiteSubOrganizations
} = require('./sites.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for site images
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

// Create a site - Admin, Manager
router.post(
    '/',
    restrictTo('admin', 'manager'),
    createSite
);

// Get all sites (list view) - Available to all roles
router.get(
    '/',
    getAllSites

);
// Get all Site Categories
router.get(
    '/categories',
    getSiteCategories
    
);

// Get all Site Sub-Organizations
router.get(
    '/sub-organizations',
    getSiteSubOrganizations
);

// Get all sites for logged-in user's organization
router.get(
    '/details',
    getAllSitesDetails
);

// Get single site (detail view) - Available to all roles
router.get(
    '/:id',
    getSiteById
);

// Update a site - Admin, Manager
router.put(
    '/:id',
    updateSite
);

// Delete a site - Admin, Manager
router.delete(
    '/:id',
    restrictTo('admin', 'manager'),
    deleteSite
);

// Upload or update a site image - Admin, Manager //TODO: Allow salesperson
router.post(
    '/:id/images',
    restrictTo('admin', 'manager'),
    imageUpload.single('image'),
    uploadSiteImage
);

// Delete a site image - Admin, Manager //TODO: Allow salesperson
router.delete(
    '/:id/images/:imageNumber',
    restrictTo('admin', 'manager', 'salesperson'),
    deleteSiteImage
);

module.exports = router;
