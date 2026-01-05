// src/middlewares/permission.middleware.js
// RBAC Permission middleware for route-level access control

const { isSystemRole, hasPermissionByRole } = require('../utils/defaultPermissions');
const Organization = require('../api/organizations/organization.model');

/**
 * Middleware to check if user has required permission AND organization's plan has the feature
 * Implements the Intersection Logic: Effective = RolePermission AND PlanFeature
 * 
 * @param {string} module - Module name (e.g., 'products', 'parties', 'employees')
 * @param {string} action - Action type ('view', 'add', 'update', 'delete')
 * @returns {Function} Express middleware
 */
const requirePermission = (module, action) => {
    return async (req, res, next) => {
        // Ensure protect middleware ran first
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required. Please ensure protect middleware runs before permission checks.'
            });
        }

        // 1. SYSTEM ROLES: superadmin/developer bypass all checks
        if (isSystemRole(req.user.role)) {
            return next();
        }

        // 2. CHECK ROLE-BASED PERMISSION
        let hasRoleAccess = false;
        if (typeof req.user.hasPermission === 'function') {
            hasRoleAccess = req.user.hasPermission(module, action);
        } else {
            hasRoleAccess = hasPermissionByRole(req.user.role, module, action);
        }

        if (!hasRoleAccess) {
            return res.status(403).json({
                status: 'error',
                message: `Access denied. You do not have ${action} permission for ${module}.`,
                requiredPermission: { module, action }
            });
        }

        // 3. CHECK SUBSCRIPTION PLAN FEATURE (Intersection Logic)
        // Skip plan check for system-level modules or if user is admin (they manage the org)
        const systemModules = ['organizations', 'systemUsers', 'subscriptions', 'settings'];
        if (systemModules.includes(module)) {
            return next();
        }

        try {
            // Fetch organization with populated subscription plan
            const org = await Organization.findById(req.user.organizationId)
                .populate('subscriptionPlanId')
                .lean();

            if (!org) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Organization not found. Please contact support.'
                });
            }

            // Check if subscription is active
            if (org.subscriptionEndDate && new Date() > new Date(org.subscriptionEndDate)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Your subscription has expired. Please renew to continue.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }

            // Check if plan includes this module
            const plan = org.subscriptionPlanId;
            if (plan && plan.enabledModules && !plan.enabledModules.includes(module)) {
                return res.status(403).json({
                    status: 'error',
                    message: `This feature (${module}) is not available in your current plan. Please upgrade to access it.`,
                    code: 'PLAN_FEATURE_UNAVAILABLE',
                    currentPlan: plan.name,
                    requiredModule: module
                });
            }

            // All checks passed!
            return next();
        } catch (error) {
            console.error('Permission middleware error:', error);
            return res.status(500).json({
                status: 'error',
                message: 'Error checking permissions. Please try again.'
            });
        }
    };
};


/**
 * Middleware to check multiple permissions (user must have ALL)
 * @param {Array<{module: string, action: string}>} permissions - Array of permission requirements
 * @returns {Function} Express middleware
 * 
 * @example
 * router.post('/transfer', requireAllPermissions([
 *   { module: 'products', action: 'write' },
 *   { module: 'parties', action: 'write' }
 * ]), transferProduct);
 */
const requireAllPermissions = (permissions) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.'
            });
        }

        for (const { module, action } of permissions) {
            let hasAccess = false;

            if (typeof req.user.hasPermission === 'function') {
                hasAccess = req.user.hasPermission(module, action);
            } else {
                hasAccess = hasPermissionByRole(req.user.role, module, action);
            }

            if (!hasAccess) {
                return res.status(403).json({
                    status: 'error',
                    message: `Access denied. You do not have ${action} permission for ${module}.`,
                    requiredPermission: { module, action }
                });
            }
        }

        return next();
    };
};

/**
 * Middleware to check multiple permissions (user must have ANY ONE)
 * @param {Array<{module: string, action: string}>} permissions - Array of permission requirements
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/dashboard', requireAnyPermission([
 *   { module: 'analytics', action: 'read' },
 *   { module: 'dashboard', action: 'read' }
 * ]), getDashboard);
 */
const requireAnyPermission = (permissions) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.'
            });
        }

        for (const { module, action } of permissions) {
            let hasAccess = false;

            if (typeof req.user.hasPermission === 'function') {
                hasAccess = req.user.hasPermission(module, action);
            } else {
                hasAccess = hasPermissionByRole(req.user.role, module, action);
            }

            if (hasAccess) {
                return next(); // Has at least one permission
            }
        }

        return res.status(403).json({
            status: 'error',
            message: 'Access denied. You do not have any of the required permissions.',
            requiredPermissions: permissions
        });
    };
};

/**
 * Middleware to check if user is a system role (superadmin/developer)
 * Use for system-level operations that shouldn't be available to org users
 * @returns {Function} Express middleware
 */
const requireSystemRole = () => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.'
            });
        }

        if (!isSystemRole(req.user.role)) {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. This action requires system-level access.'
            });
        }

        return next();
    };
};

/**
 * Middleware to check if user is organization admin
 * @returns {Function} Express middleware
 */
const requireOrgAdmin = () => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.'
            });
        }

        // System roles can also act as org admin for any org
        if (isSystemRole(req.user.role)) {
            return next();
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. This action requires organization admin privileges.'
            });
        }

        return next();
    };
};

/**
 * Attach effective permissions to request object
 * Useful for controllers that need to check permissions programmatically
 * @returns {Function} Express middleware
 */
const attachPermissions = () => {
    return (req, res, next) => {
        if (req.user && typeof req.user.getEffectivePermissions === 'function') {
            req.permissions = req.user.getEffectivePermissions();
        }
        return next();
    };
};

module.exports = {
    requirePermission,
    requireAllPermissions,
    requireAnyPermission,
    requireSystemRole,
    requireOrgAdmin,
    attachPermissions
};
