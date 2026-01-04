// src/middlewares/permission.middleware.js
// RBAC Permission middleware for route-level access control

const { isSystemRole, hasPermissionByRole } = require('../utils/defaultPermissions');

/**
 * Middleware to check if user has required permission
 * Works with the new RBAC system - checks user's effective permissions
 * 
 * @param {string} module - Module name (e.g., 'products', 'parties', 'employees')
 * @param {string} action - Action type ('read', 'write', 'delete')
 * @returns {Function} Express middleware
 * 
 * @example
 * // Require read access to products
 * router.get('/products', requirePermission('products', 'read'), getProducts);
 * 
 * // Require write access to parties
 * router.post('/parties', requirePermission('parties', 'write'), createParty);
 * 
 * // Require delete access to invoices
 * router.delete('/invoices/:id', requirePermission('orderLists', 'delete'), deleteInvoice);
 */
const requirePermission = (module, action) => {
    return (req, res, next) => {
        // Ensure protect middleware ran first
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required. Please ensure protect middleware runs before permission checks.'
            });
        }

        // Get user's effective permissions
        // If user has hasPermission method (from model), use it
        // Otherwise fallback to role-based check
        let hasAccess = false;

        if (typeof req.user.hasPermission === 'function') {
            // Use instance method (supports custom permissions)
            hasAccess = req.user.hasPermission(module, action);
        } else {
            // Fallback: use role defaults
            hasAccess = hasPermissionByRole(req.user.role, module, action);
        }

        if (!hasAccess) {
            return res.status(403).json({
                status: 'error',
                message: `Access denied. You do not have ${action} permission for ${module}.`,
                requiredPermission: { module, action }
            });
        }

        return next();
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
