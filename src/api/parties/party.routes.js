// src/api/parties/party.routes.js
// Party management routes - migrated to permission-based access

const express = require('express');
const {
    createParty,
    getAllParties,
    getAllPartiesDetails,
    getPartyById,
    updateParty,
    deleteParty,
    uploadPartyImage,
    deletePartyImage,
    bulkImportParties,
    getPartyTypes
} = require('./party.controller');
const { protect, requirePermission } = require('../../middlewares/auth.middleware');
const multer = require('multer');

const router = express.Router();

// Configure multer for party images
const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files up to 5MB are allowed!'), false);
        }
    }
});

// Apply protect middleware to all routes
router.use(protect);

// ============================================
// READ OPERATIONS - requires parties.read
// ============================================

// Get all parties (list view)
router.get('/', requirePermission('parties', 'read'), getAllParties);

// Get all parties with details
router.get('/details', requirePermission('parties', 'read'), getAllPartiesDetails);

// Get party types
router.get('/types', requirePermission('parties', 'read'), getPartyTypes);

// Get single party
router.get('/:id', requirePermission('parties', 'read'), getPartyById);

// ============================================
// WRITE OPERATIONS - requires parties.write
// ============================================

// Create a party
router.post('/', requirePermission('parties', 'write'), createParty);

// Update a party
router.put('/:id', requirePermission('parties', 'write'), updateParty);

// Bulk import parties
router.post('/bulk-import', requirePermission('parties', 'write'), bulkImportParties);

// Upload party image
router.post(
    '/:id/image',
    requirePermission('parties', 'write'),
    imageUpload.single('image'),
    uploadPartyImage
);

// ============================================
// DELETE OPERATIONS - requires parties.delete
// ============================================

// Delete a party
router.delete('/:id', requirePermission('parties', 'delete'), deleteParty);

// Delete party image
router.delete('/:id/image', requirePermission('parties', 'delete'), deletePartyImage);

module.exports = router;
