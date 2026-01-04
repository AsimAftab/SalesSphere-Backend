// src/api/sites/sites.route.js
// Site management routes - permission-based access

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
router.get('/', requirePermission('sites', 'view'), getAllSites);
router.get('/categories', requirePermission('sites', 'view'), getSiteCategories);
router.get('/sub-organizations', requirePermission('sites', 'view'), getSiteSubOrganizations);
router.get('/details', requirePermission('sites', 'view'), getAllSitesDetails);
router.get('/:id', requirePermission('sites', 'view'), getSiteById);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('sites', 'add'), createSite);
router.post('/:id/images', requirePermission('sites', 'add'), imageUpload.single('image'), uploadSiteImage);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.put('/:id', requirePermission('sites', 'update'), updateSite);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('sites', 'delete'), deleteSite);
router.delete('/:id/images/:imageNumber', requirePermission('sites', 'delete'), deleteSiteImage);

module.exports = router;
