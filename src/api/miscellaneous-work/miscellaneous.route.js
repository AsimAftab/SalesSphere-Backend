// src/api/miscellaneous-work/miscellaneous.route.js
// Miscellaneous work routes - permission-based access

const express = require('express');
const multer = require('multer');
const {
    createMiscellaneousWork,
    getAllMiscellaneousWork,
    getMyMiscellaneousWork,
    getMiscellaneousWorkById,
    updateMiscellaneousWork,
    deleteMiscellaneousWork,
    massBulkDeleteMiscellaneousWork,
    uploadMiscellaneousWorkImage,
    deleteMiscellaneousWorkImage,
    getMiscellaneousWorkImages
} = require('./miscellaneous.controller');
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
router.get('/', requirePermission('miscellaneousWork', 'view'), getAllMiscellaneousWork);
router.get('/my-work', requirePermission('miscellaneousWork', 'view'), getMyMiscellaneousWork);
router.get('/:id', requirePermission('miscellaneousWork', 'view'), getMiscellaneousWorkById);
router.get('/:id/images', requirePermission('miscellaneousWork', 'view'), getMiscellaneousWorkImages);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('miscellaneousWork', 'add'), createMiscellaneousWork);
router.post('/:id/images', requirePermission('miscellaneousWork', 'add'), imageUpload.single('image'), uploadMiscellaneousWorkImage);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.put('/:id', requirePermission('miscellaneousWork', 'update'), updateMiscellaneousWork);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('miscellaneousWork', 'delete'), deleteMiscellaneousWork);
router.delete('/mass-delete', requirePermission('miscellaneousWork', 'delete'), massBulkDeleteMiscellaneousWork);
router.delete('/:id/images/:imageNumber', requirePermission('miscellaneousWork', 'delete'), deleteMiscellaneousWorkImage);

module.exports = router;
