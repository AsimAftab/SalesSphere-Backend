// src/api/prospect/prospect.route.js
// Prospect management routes - permission-based access

const express = require('express');
const multer = require('multer');
const {
    createProspect,
    getAllProspects,
    getProspectById,
    updateProspect,
    deleteProspect,
    transferToParty,
    getAllProspectsDetails,
    createProspectCategory,
    getProspectCategories,
    uploadProspectImage,
    deleteProspectImage
} = require('./prospect.controller');
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

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

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/', requirePermission('prospects', 'view'), getAllProspects);
router.get('/details', requirePermission('prospects', 'view'), getAllProspectsDetails);
router.get('/categories', requirePermission('prospects', 'view'), getProspectCategories);
router.get('/:id', requirePermission('prospects', 'view'), getProspectById);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('prospects', 'add'), createProspect);
router.post('/:id/images', requirePermission('prospects', 'add'), imageUpload.single('image'), uploadProspectImage);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.put('/:id', requirePermission('prospects', 'update'), updateProspect);
router.post('/:id/transfer', requirePermission('prospects', 'update'), transferToParty);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('prospects', 'delete'), deleteProspect);
router.delete('/:id/images/:imageNumber', requirePermission('prospects', 'delete'), deleteProspectImage);

module.exports = router;