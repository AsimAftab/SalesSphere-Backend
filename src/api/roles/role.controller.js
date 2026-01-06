// src/api/roles/role.route.js
// Role management routes - Admin only

const express = require('express');
const {
    createRole,
    getAllRoles,
    getRoleById,
    updateRole,
    deleteRole,
    getAvailableModules,
    assignRoleToUser,
    removeRoleFromUser
} = require('./role.controller');
const { protect, requireOrgAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply protect to all routes
router.use(protect);

// Get available modules for permissions (useful for frontend)
router.get('/modules', getAvailableModules);

// CRUD routes - Admin only
router.route('/')
    .get(getAllRoles)
    .post(requireOrgAdmin(), createRole);

router.route('/:id')
    .get(getRoleById)
    .put(requireOrgAdmin(), updateRole)
    .delete(requireOrgAdmin(), deleteRole);

// Role assignment routes
router.put('/:roleId/assign/:userId', requireOrgAdmin(), assignRoleToUser);
router.delete('/assign/:userId', requireOrgAdmin(), removeRoleFromUser);

module.exports = router;
