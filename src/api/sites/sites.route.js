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
    getSiteSubOrganizations,
    createSiteCategory,
    updateSiteCategory,
    deleteSiteCategory,
    createSiteSubOrganization,
    updateSiteSubOrganization,
    deleteSiteSubOrganization,
    // Assignment controllers
    assignUsersToSite,
    removeUserFromSite,
    getSiteAssignments,
    getMyAssignedSites
} = require('./sites.controller');
const { protect, requireOrgAdmin } = require('../../middlewares/auth.middleware');
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

// GET /categories - View site categories (all authenticated users)
router.get('/categories', getSiteCategories);

// POST /categories - Create site category (all authenticated users)
router.post('/categories', checkAccess('sites', 'create'), createSiteCategory);

// PUT /categories/:id - Update site category (admin only)
router.put('/categories/:id', requireOrgAdmin(), updateSiteCategory);

// DELETE /categories/:id - Delete site category (admin only)
router.delete('/categories/:id', requireOrgAdmin(), deleteSiteCategory);

// GET /sub-organizations - View available sub-organizations (all authenticated users)
router.get('/sub-organizations', getSiteSubOrganizations);

// POST /sub-organizations - Create sub-organization (all authenticated users)
router.post('/sub-organizations', checkAccess('sites', 'create'), createSiteSubOrganization);

// PUT /sub-organizations/:id - Update sub-organization (admin only)
router.put('/sub-organizations/:id', requireOrgAdmin(), updateSiteSubOrganization);

// DELETE /sub-organizations/:id - Delete sub-organization (admin only)
router.delete('/sub-organizations/:id', requireOrgAdmin(), deleteSiteSubOrganization);

// ============================================
// ASSIGNMENT ROUTES (must be before /:id wildcard)
// ============================================
// GET /my-assigned - Get sites assigned to current user
router.get('/my-assigned',
    checkAccess('sites', 'viewAssigned'),
    getMyAssignedSites
);

// POST /:id/assign - Assign user(s) to a site
router.post('/:id/assign',
    checkAccess('sites', 'assign'),
    assignUsersToSite
);

// DELETE /:id/assign - Remove user assignment(s) from site
// Body: { userIds: string[] } - supports single or multiple user IDs
router.delete('/:id/assign',
    checkAccess('sites', 'assign'),
    removeUserFromSite
);

// GET /:id/assignments - Get all users assigned to a site
router.get('/:id/assignments',
    checkAccess('sites', 'viewDetails'),
    getSiteAssignments
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
    checkAnyAccess([
        { module: 'sites', feature: 'create' }, // For initial upload workflow
        { module: 'sites', feature: 'update' }  // For corrections later
    ]),
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
// DELETE /:id/images/:imageNumber - Permanently remove images from the site profile
router.delete('/:id/images/:imageNumber',
    checkAccess('sites', 'deleteImage'),
    deleteSiteImage
);

// DELETE /:id - Permanently remove site records from the system
router.delete('/:id',
    checkAccess('sites', 'delete'),
    deleteSite
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



module.exports = router;
