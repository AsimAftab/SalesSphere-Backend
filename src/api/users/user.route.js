const express = require('express');
const multer = require('multer'); // Import multer
const userController = require('./user.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for DOCUMENTS: PDF only, 2MB limit
const documentUpload = multer({
    dest: 'tmp/', // Temporary storage before Cloudinary
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB size limit per file
    },
    fileFilter: (req, file, cb) => {
        // Allow only PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true); // Accept the file
        } else {
            // Reject other file types
            cb(new Error('Only PDF documents up to 2MB are allowed!'), false);
        }
    }
});

// Configure a SEPARATE multer for IMAGES (Avatars/Profile Pics)
const imageUpload = multer({
    dest: 'tmp/',
    limits: {
        fileSize: 5 * 1024 * 1024 // Example: 5MB limit for images
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPG, PNG, GIF etc.) up to 5MB are allowed!'), false);
        }
    }
});


// Apply the 'protect' middleware to all routes below this point
router.use(protect);

// Routes for managing users within an organization
router.route('/')
    .post(restrictTo('admin', 'manager'), imageUpload.single('avatar'), userController.createUser)
    .get(restrictTo('admin', 'manager'), userController.getAllUsers);

// Route for users to update their OWN profile image
router.put(
    '/me/profile-image',
    imageUpload.single('profileImage'),
    userController.updateMyProfileImage
);

// Routes for managing a specific user by ID (Admin/Manager only)
router.route('/:id')
    .get(restrictTo('admin', 'manager'), userController.getUserById)
    .put(restrictTo('admin', 'manager'), userController.updateUser)
    .delete(restrictTo('admin', 'manager'), userController.deleteUser);

// Route for uploading documents for a specific user (Admin/Manager only)
router.post(
    '/:id/documents',
    restrictTo('admin', 'manager'),
    // Use documentUpload configuration
    // Use .array() to accept multiple files under the 'documents' field name
    // Allow up to 5 files per request (adjust as needed)
    documentUpload.array('documents', 5), 
    // --- FIX: Use the correct plural function name ---
    userController.uploadUserDocuments 
);


module.exports = router;

