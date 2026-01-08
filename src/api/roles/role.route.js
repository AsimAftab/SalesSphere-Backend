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
const { protect, checkAccess } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Apply protect to all routes
router.use(protect);

// Get available modules for permissions (useful for frontend)
router.get('/modules', getAvailableModules);

// CRUD routes - Admin only
router.route('/')
    .get(getAllRoles)
    .post(checkAccess('settings', 'manageRoles'), createRole);

router.route('/:id')
    .get(getRoleById)
    .put(checkAccess('settings', 'manageRoles'), updateRole)
    .delete(checkAccess('settings', 'manageRoles'), deleteRole);

// Role assignment routes
router.put('/:roleId/assign/:userId', checkAccess('settings', 'manageRoles'), assignRoleToUser);
router.delete('/assign/:userId', checkAccess('settings', 'manageRoles'), removeRoleFromUser);

module.exports = router;
