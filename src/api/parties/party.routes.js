// src/api/parties/party.routes.js
// Party management routes - permission-based access

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

router.use(protect);

// VIEW operations
router.get('/', requirePermission('parties', 'view'), getAllParties);
router.get('/details', requirePermission('parties', 'view'), getAllPartiesDetails);
router.get('/types', requirePermission('parties', 'view'), getPartyTypes);
router.get('/:id', requirePermission('parties', 'view'), getPartyById);

// ADD operations
router.post('/', requirePermission('parties', 'add'), createParty);
router.post('/bulk-import', requirePermission('parties', 'add'), bulkImportParties);
router.post('/:id/image', requirePermission('parties', 'add'), imageUpload.single('image'), uploadPartyImage);

// UPDATE operations
router.put('/:id', requirePermission('parties', 'update'), updateParty);

// DELETE operations
router.delete('/:id', requirePermission('parties', 'delete'), deleteParty);
router.delete('/:id/image', requirePermission('parties', 'delete'), deletePartyImage);

module.exports = router;
