
// Routes for beat plan templates (using beatPlan module permissions)

const express = require('express');
const {
    createBeatPlanList,
    getAllBeatPlanLists,
    getBeatPlanListById,
    updateBeatPlanList,
    deleteBeatPlanList
} = require('./beatPlanList.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess } = require('../../middlewares/compositeAccess.middleware');

const router = express.Router();

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
// GET / - List all beat plan templates
router.get('/',
    checkAccess('beatPlan', 'viewListTemplates'),
    getAllBeatPlanLists
);

// GET /:id - Get specific template details
router.get('/:id',
    checkAccess('beatPlan', 'viewDetailsTemplate'),
    getBeatPlanListById
);

// ============================================
// CREATE OPERATIONS
// ============================================
// POST / - Create new beat plan template
router.post('/',
    checkAccess('beatPlan', 'createList'),
    createBeatPlanList
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PUT /:id - Update beat plan template
router.put('/:id',
    checkAccess('beatPlan', 'updateList'),
    updateBeatPlanList
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Delete beat plan template
router.delete('/:id',
    checkAccess('beatPlan', 'deleteList'),
    deleteBeatPlanList
);

module.exports = router;

