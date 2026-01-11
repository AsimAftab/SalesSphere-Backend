// src/middlewares/compositeAccess.middleware.js
// Composite Permission Middleware - Checks BOTH Plan (Subscription) AND Role
// This is the MAIN middleware to use for route protection

const { isSystemRole, getRoleDefaultFeatures } = require('../utils/defaultPermissions');
const { isValidFeature } = require('../config/featureRegistry');
const Organization = require('../api/organizations/organization.model');

/**
 * MAIN MIDDLEWARE: Check BOTH Plan Feature AND Role Feature
 * Access = Plan Feature Enabled AND Role Feature Granted
 *
 * This is the primary middleware for route protection with granular permissions
 *
 * @param {string} moduleName - Module name (e.g., 'attendance', 'products')
 * @param {string} featureKey - Feature key (e.g., 'webCheckIn', 'exportPdf')
 * @returns {Function} Express middleware
 *
 * @example
 * // Check if user can do web check-in (needs both plan + role permission)
 * router.post('/attendance/checkin/web',
 *   checkAccess('attendance', 'webCheckIn'),
 *   webCheckInHandler
 * );
 *
 * @example
 * // Check if user can export products PDF
 * router.get('/products/export/pdf',
 *   checkAccess('products', 'exportPdf'),
 *   exportPdfHandler
 * );
 */
const checkAccess = (moduleName, featureKey) => {
    return async (req, res, next) => {
        // Ensure protect middleware ran first
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required. Please ensure protect middleware runs before access checks.',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        // 1. SYSTEM ROLES: superadmin/developer bypass all checks
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

        // 3. CHECK PLAN: Is feature enabled in organization's subscription?
        const planCheckResult = await checkPlanFeatureForOrg(req, req.user.organizationId, moduleName, featureKey);
        if (!planCheckResult.allowed) {
            return res.status(403).json({
                status: 'error',
                message: planCheckResult.message,
                code: planCheckResult.code,
                reason: 'PLAN',
                currentPlan: planCheckResult.planName
            });
        }

        // 4. CHECK ROLE: Does user's role have this feature permission?
        const roleCheckResult = checkRoleFeaturePermission(req.user, moduleName, featureKey);
        if (!roleCheckResult.allowed) {
            return res.status(403).json({
                status: 'error',
                message: roleCheckResult.message,
                code: 'FEATURE_ACCESS_DENIED',
                reason: 'ROLE',
                userRole: req.user.role,
                hasCustomRole: !!req.user.customRoleId
            });
        }

        // All checks passed - user has access!
        return next();
    };
};

/**
 * Check if feature is enabled in organization's subscription plan
 *
 * OPTIMIZATION: Uses req.organization (attached by protect middleware) to avoid
 * redundant database queries. Falls back to DB query only if not attached.
 *
 * @param {Object} req - Express request object (may have req.organization)
 * @param {string} organizationId - Organization ID (fallback)
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key
 * @returns {Object} { allowed: boolean, message?: string, code?: string, planName?: string }
 */
async function checkPlanFeatureForOrg(req, organizationId, moduleName, featureKey) {
    try {
        // Use cached organization from protect middleware if available
        let org = req.organization;

        // Fallback: Query DB if not cached (shouldn't happen in normal flow)
        if (!org) {
            org = await Organization.findById(organizationId)
                .populate('subscriptionPlanId')
                .lean();
        }

        if (!org) {
            return {
                allowed: false,
                message: 'Organization not found. Please contact support.',
                code: 'ORGANIZATION_NOT_FOUND'
            };
        }

        // Check subscription expiry
        if (org.subscriptionEndDate && new Date() > new Date(org.subscriptionEndDate)) {
            return {
                allowed: false,
                message: 'Your subscription has expired. Please renew to continue.',
                code: 'SUBSCRIPTION_EXPIRED'
            };
        }

        const plan = org.subscriptionPlanId;
        if (!plan) {
            return {
                allowed: false,
                message: 'No subscription plan found. Please contact support.',
                code: 'NO_SUBSCRIPTION_PLAN'
            };
        }

        // Check if module is enabled
        if (plan.enabledModules && !plan.enabledModules.includes(moduleName)) {
            return {
                allowed: false,
                message: `The ${moduleName} module is not available in your current plan (${plan.name}).`,
                code: 'MODULE_NOT_IN_PLAN',
                planName: plan.name
            };
        }

        // Check if specific feature is enabled
        let hasFeature = false;

        if (plan.moduleFeatures) {
            // Handle Mongoose Map (if not lean) or Plain Object (if lean)
            const moduleFeatures = plan.moduleFeatures.get
                ? plan.moduleFeatures.get(moduleName)
                : plan.moduleFeatures[moduleName];

            if (moduleFeatures) {
                hasFeature = moduleFeatures.get
                    ? moduleFeatures.get(featureKey) === true
                    : moduleFeatures[featureKey] === true;
            }
        }

        if (!hasFeature) {
            return {
                allowed: false,
                message: `The feature "${featureKey}" is not enabled in your current plan (${plan.name}).`,
                code: 'FEATURE_NOT_IN_PLAN',
                planName: plan.name
            };
        }

        return { allowed: true };

    } catch (error) {
        console.error('Plan check error:', error);
        return {
            allowed: false,
            message: 'Error checking plan features. Please try again.',
            code: 'PLAN_CHECK_ERROR'
        };
    }
}

/**
 * Check if user's role has a specific feature permission
 * 
 * FALLBACK LOGIC: When a feature key is MISSING (undefined) from a custom role,
 * we fall back to built-in role defaults. This handles the "Maintenance Challenge"
 * where new features are added to code but existing roles in DB don't have those keys.
 * 
 * Priority:
 * 1. Custom role explicit value (true/false) - use it
 * 2. Custom role missing key (undefined) - fall back to role defaults
 * 3. No custom role - use built-in role defaults
 * 
 * @param {Object} user - User object
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key
 * @returns {Object} { allowed: boolean, message?: string }
 */
function checkRoleFeaturePermission(user, moduleName, featureKey) {
    const { role, customRoleId } = user;

    // 1. Check custom role first (highest priority)
    if (customRoleId && customRoleId.permissions) {
        // Handle both Map and plain object (for backward compatibility)
        let customValue;

        if (customRoleId.permissions instanceof Map || customRoleId.permissions.get) {
            // Map-based permissions (new format)
            const modulePerms = customRoleId.permissions.get(moduleName);
            customValue = modulePerms?.get?.(featureKey);
        } else {
            // Plain object permissions (legacy or populated as object)
            customValue = customRoleId.permissions[moduleName]?.[featureKey];
        }

        // Explicit TRUE in custom role - ALLOW
        if (customValue === true) {
            return { allowed: true };
        }

        // Explicit FALSE in custom role - DENY
        if (customValue === false) {
            return {
                allowed: false,
                message: `Your custom role does not have permission for "${featureKey}" in ${moduleName}.`
            };
        }

        // UNDEFINED (key missing from DB) - FALLBACK to role defaults
        // This handles new features added after role was created
        const roleDefaults = getRoleDefaultFeatures(role, moduleName);
        const defaultValue = roleDefaults?.[featureKey];

        if (defaultValue === true) {
            // Role default grants this - allow (self-healing for admins)
            return { allowed: true };
        }

        // Role default denies or key doesn't exist in defaults either
        return {
            allowed: false,
            message: `Your role does not have permission for "${featureKey}" in ${moduleName}.`
        };
    }

    // 2. No custom role - Check built-in role permissions directly
    const roleFeatures = getRoleDefaultFeatures(role, moduleName);

    if (roleFeatures && roleFeatures[featureKey] === true) {
        return { allowed: true };
    }

    return {
        allowed: false,
        message: `Your role (${role}) does not have permission for "${featureKey}" in ${moduleName}.`
    };
}

/**
 * Check if user has access to ANY of the given features (Plan AND Role)
 * User needs at least one feature to be available in plan AND granted by role
 *
 * @param {Array<{module: string, feature: string}>} features - Array of feature requirements
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/attendance/checkin',
 *   checkAnyAccess([
 *     { module: 'attendance', feature: 'webCheckIn' },
 *     { module: 'attendance', feature: 'mobileCheckIn' }
 *   ]),
 *   checkInHandler
 * );
 */
const checkAnyAccess = (features) => {
    return async (req, res, next) => {
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

        // Check each feature - user needs at least one where BOTH plan and role allow
        for (const { module, feature } of features) {
            if (!isValidFeature(module, feature)) continue;

            const planCheck = await checkPlanFeatureForOrg(req, req.user.organizationId, module, feature);
            if (!planCheck.allowed) continue;

            const roleCheck = checkRoleFeaturePermission(req.user, module, feature);
            if (!roleCheck.allowed) continue;

            // Both plan and role allow this feature
            return next();
        }

        // No feature passed both checks
        return res.status(403).json({
            status: 'error',
            message: 'Access denied. You do not have any of the required permissions.',
            code: 'NO_ACCESS',
            requiredPermissions: features
        });
    };
};

/**
 * Check if user has access to ALL specified features (Plan AND Role)
 * User must have ALL features available in plan AND granted by role
 *
 * @param {Array<{module: string, feature: string}>} features - Array of feature requirements
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/products/bulk-operations',
 *   checkAllAccess([
 *     { module: 'products', feature: 'bulkImport' },
 *     { module: 'products', feature: 'bulkDelete' }
 *   ]),
 *   bulkOperationsHandler
 * );
 */
const checkAllAccess = (features) => {
    return async (req, res, next) => {
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

        // Check each feature - ALL must pass both plan and role checks
        for (const { module, feature } of features) {
            if (!isValidFeature(module, feature)) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Invalid feature configuration.',
                    code: 'INVALID_FEATURE_CONFIG'
                });
            }

            const planCheck = await checkPlanFeatureForOrg(req, req.user.organizationId, module, feature);
            if (!planCheck.allowed) {
                return res.status(403).json({
                    status: 'error',
                    message: planCheck.message,
                    code: planCheck.code,
                    reason: 'PLAN'
                });
            }

            const roleCheck = checkRoleFeaturePermission(req.user, module, feature);
            if (!roleCheck.allowed) {
                return res.status(403).json({
                    status: 'error',
                    message: roleCheck.message,
                    code: 'FEATURE_ACCESS_DENIED',
                    reason: 'ROLE'
                });
            }
        }

        return next();
    };
};

/**
 * Module-level access check (coarse, single feature check)
 * Checks if module is enabled in plan AND user has the specified view access
 *
 * @param {string} moduleName - Module name
 * @param {string} [viewKey='view'] - The view feature key to check (e.g., 'view', 'viewList', 'viewDetails')
 * @returns {Function} Express middleware
 *
 * @example
 * // Using default 'view' key
 * router.get('/settings', checkModuleAccess('settings'), getSettings);
 * 
 * // Using custom view key for modules with 'viewList'
 * router.get('/expenses', checkModuleAccess('expenses', 'viewList'), getExpenses);
 */
const checkModuleAccess = (moduleName, viewKey = 'view') => {
    return async (req, res, next) => {
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

        // Validate the view key exists in registry
        if (!isValidFeature(moduleName, viewKey)) {
            console.error(`Invalid module access check: ${moduleName}.${viewKey}`);
            return res.status(500).json({
                status: 'error',
                message: 'Invalid module configuration. Please contact support.',
                code: 'INVALID_MODULE_CONFIG'
            });
        }

        // Check plan module access
        const planCheck = await checkPlanFeatureForOrg(req, req.user.organizationId, moduleName, viewKey);
        if (!planCheck.allowed) {
            return res.status(403).json({
                status: 'error',
                message: planCheck.message,
                code: planCheck.code,
                reason: 'PLAN'
            });
        }

        // Check role view permission
        const roleCheck = checkRoleFeaturePermission(req.user, moduleName, viewKey);
        if (!roleCheck.allowed) {
            return res.status(403).json({
                status: 'error',
                message: roleCheck.message,
                code: 'FEATURE_ACCESS_DENIED',
                reason: 'ROLE'
            });
        }

        return next();
    };
};

/**
 * Middleware to check if user is a system role (superadmin/developer)
 * Use for system-level operations that shouldn't be available to org users
 * @returns {Function} Express middleware
 * 
 * @example
 * router.post('/plans', requireSystemRole(), createPlan);
 */
const requireSystemRole = () => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        if (!isSystemRole(req.user.role)) {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. This action requires system-level access.',
                code: 'SYSTEM_ROLE_REQUIRED'
            });
        }

        return next();
    };
};

/**
 * Middleware to check if user is organization admin
 * System roles (superadmin/developer) also pass this check
 * @returns {Function} Express middleware
 * 
 * @example
 * router.post('/roles', requireOrgAdmin(), createRole);
 */
const requireOrgAdmin = () => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        // System roles can also act as org admin for any org
        if (isSystemRole(req.user.role)) {
            return next();
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. This action requires organization admin privileges.',
                code: 'ORG_ADMIN_REQUIRED'
            });
        }

        return next();
    };
};

module.exports = {
    checkAccess,
    checkAnyAccess,
    checkAllAccess,
    checkModuleAccess,
    requireSystemRole,
    requireOrgAdmin,
    checkRoleFeaturePermission
};
