// src/middlewares/featureRegistry.middleware.js
// Granular Feature Permission Middleware (Role-Based Access Control)

const { isSystemRole } = require('../utils/defaultPermissions');
const { isValidFeature } = require('../config/featureRegistry');

/**
 * Middleware to check if user's role has a specific granular feature permission
 * This is the ROLE-BASED control layer (fine-grained)
 *
 * @param {string} moduleName - Module name (e.g., 'attendance', 'products')
 * @param {string} featureKey - Feature key to check (e.g., 'webCheckIn', 'exportPdf')
 * @returns {Function} Express middleware
 *
 * @example
 * // Check if user role allows web check-in
 * router.post('/attendance/checkin/web',
 *   checkFeatureAccess('attendance', 'webCheckIn'),
 *   webCheckInHandler
 * );
 *
 * // Check if user role allows PDF export
 * router.get('/products/export/pdf',
 *   checkFeatureAccess('products', 'exportPdf'),
 *   exportPdfHandler
 * );
 */
const checkFeatureAccess = (moduleName, featureKey) => {
    return (req, res, next) => {
        // Ensure protect middleware ran first
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required. Please ensure protect middleware runs before feature checks.',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        // 1. SYSTEM ROLES: superadmin/developer bypass all feature checks
        if (isSystemRole(req.user.role)) {
            return next();
        }

        // 2. Validate the module and feature key
        if (!isValidFeature(moduleName, featureKey)) {
            console.error(`Invalid feature check: ${moduleName}.${featureKey}`);
            return res.status(500).json({
                status: 'error',
                message: 'Invalid feature configuration. Please contact support.',
                code: 'INVALID_FEATURE_CONFIG'
            });
        }

        // 3. CHECK ROLE-BASED FEATURE PERMISSION
        const hasFeaturePermission = checkUserFeaturePermission(req.user, moduleName, featureKey);

        if (!hasFeaturePermission) {
            return res.status(403).json({
                status: 'error',
                message: `Access denied. You do not have permission for "${featureKey}" in ${moduleName}.`,
                code: 'FEATURE_ACCESS_DENIED',
                requiredPermission: { module: moduleName, feature: featureKey },
                userRole: req.user.role,
                hasCustomRole: !!req.user.customRoleId
            });
        }

        // All checks passed - user has feature permission!
        return next();
    };
};

/**
 * Check if user has a specific feature permission
 * Handles both built-in roles and custom roles
 *
 * @param {Object} user - User object with role and customRoleId
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key to check
 * @returns {boolean}
 */
function checkUserFeaturePermission(user, moduleName, featureKey) {
    const { role, customRoleId } = user;

    // 1. Check custom role first (highest priority for org roles)
    if (customRoleId && customRoleId.permissions) {
        // Check if custom role has the granular feature permission
        // Custom roles store granular features in: permissions.module.featureKey
        if (customRoleId.permissions[moduleName]) {
            // For granular permissions, check if featureKey is directly set
            if (customRoleId.permissions[moduleName][featureKey] === true) {
                return true;
            }
        }
        // If custom role doesn't have the feature, deny
        return false;
    }

    // 2. Check built-in role permissions
    // Built-in roles (admin, user) have default permissions
    const { getRoleDefaultFeatures } = require('../utils/defaultPermissions');
    const roleFeatures = getRoleDefaultFeatures(role, moduleName);

    if (roleFeatures && roleFeatures[featureKey] === true) {
        return true;
    }

    return false;
}

/**
 * Middleware to check if user has ALL specified features
 * User must have every feature listed to proceed
 *
 * @param {Array<{module: string, feature: string}>} features - Array of feature requirements
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/some-action',
 *   requireAllFeatures([
 *     { module: 'products', feature: 'view' },
 *     { module: 'products', feature: 'update' }
 *   ]),
 *   handler
 * );
 */
const requireAllFeatures = (features) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        if (isSystemRole(req.user.role)) {
            return next();
        }

        for (const { module, feature } of features) {
            if (!isValidFeature(module, feature)) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Invalid feature configuration.',
                    code: 'INVALID_FEATURE_CONFIG'
                });
            }

            if (!checkUserFeaturePermission(req.user, module, feature)) {
                return res.status(403).json({
                    status: 'error',
                    message: `Access denied. You do not have permission for "${feature}" in ${module}.`,
                    code: 'FEATURE_ACCESS_DENIED',
                    requiredPermission: { module, feature }
                });
            }
        }

        return next();
    };
};

/**
 * Middleware to check if user has ANY of the specified features
 * User needs at least one feature to proceed
 *
 * @param {Array<{module: string, feature: string}>} features - Array of feature requirements
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/attendance/checkin',
 *   requireAnyFeature([
 *     { module: 'attendance', feature: 'webCheckIn' },
 *     { module: 'attendance', feature: 'mobileCheckIn' }
 *   ]),
 *   checkInHandler
 * );
 */
const requireAnyFeature = (features) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        if (isSystemRole(req.user.role)) {
            return next();
        }

        for (const { module, feature } of features) {
            if (isValidFeature(module, feature) && checkUserFeaturePermission(req.user, module, feature)) {
                return next(); // Has at least one feature permission
            }
        }

        return res.status(403).json({
            status: 'error',
            message: 'Access denied. You do not have any of the required permissions.',
            code: 'NO_FEATURE_ACCESS',
            requiredPermissions: features
        });
    };
};

/**
 * Middleware to check if user's role allows viewing team data vs own data only
 * Useful for controllers that need to filter data based on hierarchy
 *
 * @param {string} moduleName - Module name
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/attendance',
 *   checkTeamAccess('attendance'),
 *   attendanceController.getAttendance
 * );
 */
const checkTeamAccess = (moduleName) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        if (isSystemRole(req.user.role)) {
            req.canViewTeamData = true;
            return next();
        }

        // Check if user has team access permission
        const hasTeamAccess = checkUserFeaturePermission(req.user, moduleName, 'viewTeamAttendance') ||
                             checkUserFeaturePermission(req.user, moduleName, 'viewTeam');

        req.canViewTeamData = hasTeamAccess;
        return next();
    };
};

module.exports = {
    checkFeatureAccess,
    requireAllFeatures,
    requireAnyFeature,
    checkTeamAccess
};
