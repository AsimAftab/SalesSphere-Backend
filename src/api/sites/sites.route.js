// src/api/sites/sites.route.js
// Site management routes - granular feature-based access control

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
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

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
// GET / - View all registered sites and project locations
router.get('/',
    checkAccess('sites', 'viewList'),
    getAllSites
);

// GET /details - View all sites with full details
router.get('/details',
    checkAccess('sites', 'viewDetails'),
    getAllSitesDetails
);

// GET /categories - View site categories
// Dependency: Users who can create/update sites also need to view categories (auto-created via syncSiteInterest)
router.get('/categories',
    checkAnyAccess([
        { module: 'sites', feature: 'viewInterests' },
        { module: 'sites', feature: 'create' },
        { module: 'sites', feature: 'update' }
    ]),
    getSiteCategories
);

// GET /sub-organizations - View available sub-organizations
// Dependency: Users who can create/update sites also need to view sub-orgs (auto-created via syncSubOrganization)
router.get('/sub-organizations',
    checkAnyAccess([
        { module: 'sites', feature: 'viewSubOrganizations' },
        { module: 'sites', feature: 'create' },
        { module: 'sites', feature: 'update' }
    ]),
    getSiteSubOrganizations
);

// GET /:id - Access detailed configuration and history for a specific site
router.get('/:id',
    checkAccess('sites', 'viewDetails'),
    getSiteById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Register new site locations (implicitly creates categories/sub-orgs)
router.post('/',
    checkAccess('sites', 'create'),
    createSite
);

// POST /:id/images - Upload site photos, blueprints, or progress images
router.post('/:id/images',
    checkAccess('sites', 'uploadImage'),
    imageUpload.single('image'),
    uploadSiteImage
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Edit site details, boundaries, or contact information
router.put('/:id',
    checkAccess('sites', 'update'),
    updateSite
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Permanently remove site records from the system
router.delete('/:id',
    checkAccess('sites', 'delete'),
    deleteSite
);

// DELETE /:id/images/:imageNumber - Permanently remove images from the site profile
router.delete('/:id/images/:imageNumber',
    checkAccess('sites', 'deleteImage'),
    deleteSiteImage
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Export the site directory as a PDF document
// router.get('/export/pdf',
//     checkAccess('sites', 'exportPdf'),
//     exportSitesPdf
// );

// GET /export/excel - Export site data and coordinates to an Excel spreadsheet
// router.get('/export/excel',
//     checkAccess('sites', 'exportExcel'),
//     exportSitesExcel
// );

// ============================================
// CATEGORY MANAGEMENT ROUTES (Future)
// ============================================
// Note: Site categories are auto-created via syncSiteInterest when creating/updating sites
// Users with 'create' or 'update' permission can implicitly create site categories
// For explicit category management routes, use:
// POST /categories - Create site category
// router.post('/categories',
//     checkAnyAccess([
//         { module: 'sites', feature: 'manageCategories' },
//         { module: 'sites', feature: 'create' },
//         { module: 'sites', feature: 'update' }
//     ]),
//     createSiteCategory
// );

module.exports = router;
