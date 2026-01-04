// src/api/roles/role.controller.js
// Role CRUD operations for organization admins

const Role = require('./role.model');
const User = require('../users/user.model');
const { ALL_MODULES, isSystemRole } = require('../../utils/defaultPermissions');

/**
 * @desc    Create a new role
 * @route   POST /api/v1/roles
 * @access  Admin only
 */
exports.createRole = async (req, res) => {
    try {
        const { name, description, permissions } = req.body;

        // Must be admin or system role
        if (!isSystemRole(req.user.role) && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only admins can create roles'
            });
        }

        // Get organization ID
        const organizationId = isSystemRole(req.user.role)
            ? req.body.organizationId
            : req.user.organizationId;

        if (!organizationId) {
            return res.status(400).json({
                status: 'error',
                message: 'Organization ID is required'
            });
        }

        // Check if role with same name exists in this org
        const existingRole = await Role.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            organizationId
        });

        if (existingRole) {
            return res.status(400).json({
                status: 'error',
                message: 'A role with this name already exists in your organization'
            });
        }

        // Create the role
        const role = await Role.create({
            name,
            description,
            organizationId,
            permissions: permissions || {},
            mobileAppAccess: req.body.mobileAppAccess || false,
            webPortalAccess: req.body.webPortalAccess || false,
            createdBy: req.user._id
        });

        res.status(201).json({
            status: 'success',
            message: 'Role created successfully',
            data: role
        });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to create role'
        });
    }
};

/**
 * @desc    Get all roles for organization
 * @route   GET /api/v1/roles
 * @access  Admin, Manager
 */
exports.getAllRoles = async (req, res) => {
    try {
        const organizationId = isSystemRole(req.user.role)
            ? req.query.organizationId
            : req.user.organizationId;

        if (!organizationId) {
            return res.status(400).json({
                status: 'error',
                message: 'Organization ID is required'
            });
        }

        const roles = await Role.find({
            organizationId,
            isActive: true
        })
            .select('-__v')
            .sort({ name: 1 });

        res.status(200).json({
            status: 'success',
            count: roles.length,
            data: roles
        });
    } catch (error) {
        console.error('Get all roles error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch roles'
        });
    }
};

/**
 * @desc    Get single role by ID
 * @route   GET /api/v1/roles/:id
 * @access  Admin, Manager
 */
exports.getRoleById = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);

        if (!role) {
            return res.status(404).json({
                status: 'error',
                message: 'Role not found'
            });
        }

        // Check organization access
        if (!isSystemRole(req.user.role) &&
            role.organizationId.toString() !== req.user.organizationId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied to this role'
            });
        }

        res.status(200).json({
            status: 'success',
            data: role
        });
    } catch (error) {
        console.error('Get role by ID error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch role'
        });
    }
};

/**
 * @desc    Update role
 * @route   PUT /api/v1/roles/:id
 * @access  Admin only
 */
exports.updateRole = async (req, res) => {
    try {
        const { name, description, permissions, isActive } = req.body;

        // Must be admin or system role
        if (!isSystemRole(req.user.role) && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only admins can update roles'
            });
        }

        const role = await Role.findById(req.params.id);

        if (!role) {
            return res.status(404).json({
                status: 'error',
                message: 'Role not found'
            });
        }

        // Check organization access
        if (!isSystemRole(req.user.role) &&
            role.organizationId.toString() !== req.user.organizationId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied to this role'
            });
        }

        // Prevent updating default roles
        if (role.isDefault) {
            return res.status(400).json({
                status: 'error',
                message: 'Default roles cannot be modified'
            });
        }

        // Check for duplicate name (if name changed)
        if (name && name !== role.name) {
            const existingRole = await Role.findOne({
                name: { $regex: new RegExp(`^${name}$`, 'i') },
                organizationId: role.organizationId,
                _id: { $ne: role._id }
            });

            if (existingRole) {
                return res.status(400).json({
                    status: 'error',
                    message: 'A role with this name already exists'
                });
            }
        }

        // Update fields
        if (name) role.name = name;
        if (description !== undefined) role.description = description;
        if (permissions) role.permissions = permissions;
        if (req.body.mobileAppAccess !== undefined) role.mobileAppAccess = req.body.mobileAppAccess;
        if (req.body.webPortalAccess !== undefined) role.webPortalAccess = req.body.webPortalAccess;
        if (isActive !== undefined) role.isActive = isActive;

        await role.save();

        res.status(200).json({
            status: 'success',
            message: 'Role updated successfully',
            data: role
        });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to update role'
        });
    }
};

/**
 * @desc    Delete role
 * @route   DELETE /api/v1/roles/:id
 * @access  Admin only
 */
exports.deleteRole = async (req, res) => {
    try {
        // Must be admin or system role
        if (!isSystemRole(req.user.role) && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only admins can delete roles'
            });
        }

        const role = await Role.findById(req.params.id);

        if (!role) {
            return res.status(404).json({
                status: 'error',
                message: 'Role not found'
            });
        }

        // Check organization access
        if (!isSystemRole(req.user.role) &&
            role.organizationId.toString() !== req.user.organizationId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied to this role'
            });
        }

        // Prevent deleting default roles
        if (role.isDefault) {
            return res.status(400).json({
                status: 'error',
                message: 'Default roles cannot be deleted'
            });
        }

        // Check if any users are assigned to this role
        const usersWithRole = await User.countDocuments({ customRoleId: role._id });

        if (usersWithRole > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role. Please reassign them first.`
            });
        }

        await Role.findByIdAndDelete(req.params.id);

        res.status(200).json({
            status: 'success',
            message: 'Role deleted successfully'
        });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to delete role'
        });
    }
};

/**
 * @desc    Get available modules for permissions
 * @route   GET /api/v1/roles/modules
 * @access  Admin, Manager
 */
exports.getAvailableModules = async (req, res) => {
    try {
        // Filter out system-only modules
        const modules = ALL_MODULES.filter(m =>
            !['organizations', 'systemUsers', 'subscriptions'].includes(m)
        );

        res.status(200).json({
            status: 'success',
            data: modules.map(m => ({
                key: m,
                label: m.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
            }))
        });
    } catch (error) {
        console.error('Get modules error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch modules'
        });
    }
};

/**
 * @desc    Assign role to user
 * @route   PUT /api/v1/roles/:roleId/assign/:userId
 * @access  Admin only
 */
exports.assignRoleToUser = async (req, res) => {
    try {
        const { roleId, userId } = req.params;

        // Must be admin or system role
        if (!isSystemRole(req.user.role) && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only admins can assign roles'
            });
        }

        const [role, user] = await Promise.all([
            Role.findById(roleId),
            User.findById(userId)
        ]);

        if (!role) {
            return res.status(404).json({
                status: 'error',
                message: 'Role not found'
            });
        }

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Check organization access
        if (!isSystemRole(req.user.role)) {
            if (role.organizationId.toString() !== req.user.organizationId.toString() ||
                user.organizationId.toString() !== req.user.organizationId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access denied'
                });
            }
        }

        // Prevent assigning roles to admins
        if (user.role === 'admin') {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot assign custom role to admin users'
            });
        }

        // Assign the custom role
        user.customRoleId = role._id;
        user.role = 'user'; // Set base role to user, custom role provides permissions
        await user.save();

        res.status(200).json({
            status: 'success',
            message: `Role "${role.name}" assigned to user successfully`,
            data: {
                userId: user._id,
                userName: user.name,
                roleName: role.name,
                roleId: role._id
            }
        });
    } catch (error) {
        console.error('Assign role error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to assign role'
        });
    }
};

/**
 * @desc    Remove custom role from user
 * @route   DELETE /api/v1/roles/assign/:userId
 * @access  Admin only
 */
exports.removeRoleFromUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Must be admin or system role
        if (!isSystemRole(req.user.role) && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only admins can remove roles'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Check organization access
        if (!isSystemRole(req.user.role) &&
            user.organizationId.toString() !== req.user.organizationId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied'
            });
        }

        // Remove custom role
        user.customRoleId = undefined;
        await user.save();

        res.status(200).json({
            status: 'success',
            message: 'Custom role removed from user'
        });
    } catch (error) {
        console.error('Remove role error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to remove role'
        });
    }
};
