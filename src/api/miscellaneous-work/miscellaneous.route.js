const express = require('express');
const multer = require('multer');
const {
    createMiscellaneousWork,
    getAllMiscellaneousWork,
    getMyMiscellaneousWork,
    getMiscellaneousWorkById,
    updateMiscellaneousWork,
    deleteMiscellaneousWork,
    uploadMiscellaneousWorkImage,
    deleteMiscellaneousWorkImage,
    getMiscellaneousWorkImages
} = require('./miscellaneous.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for images
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

// Create a miscellaneous work entry - All authenticated users
router.post(
    '/',
    createMiscellaneousWork
);

// Get all miscellaneous work entries with optional filters (date, month, year)
router.get(
    '/',
    getAllMiscellaneousWork
);

// Get miscellaneous work entries for the logged-in user (salesperson)
// Note: This route must be defined BEFORE /:id to avoid conflicts
router.get(
    '/my-work',
    getMyMiscellaneousWork
);

// Get single miscellaneous work entry
router.get(
    '/:id',
    getMiscellaneousWorkById
);

// Update a miscellaneous work entry - Admin, Manager
router.put(
    '/:id',
    restrictTo('admin', 'manager', 'salesperson'),
    updateMiscellaneousWork
);

// Delete a miscellaneous work entry - Admin, Manager
router.delete(
    '/:id',
    restrictTo('admin', 'manager', 'salesperson'),
    deleteMiscellaneousWork
);

// Get images for a specific miscellaneous work entry
router.get(
    '/:id/images',
    getMiscellaneousWorkImages
);

// Upload or update an image - All authenticated users
router.post(
    '/:id/images',
    imageUpload.single('image'),
    uploadMiscellaneousWorkImage
);

// Delete an image - Admin, Manager
router.delete(
    '/:id/images/:imageNumber',
    restrictTo('admin', 'manager', 'salesperson'),
    deleteMiscellaneousWorkImage
);

module.exports = router;
