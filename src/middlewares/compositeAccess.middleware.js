// src/middlewares/compositeAccess.middleware.js
// Composite Permission Middleware - Checks BOTH Plan (Subscription) AND Role
// This is the MAIN middleware to use for route protection

const { isSystemRole } = require('../utils/defaultPermissions');
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
        const planCheckResult = await checkPlanFeatureForOrg(req.user.organizationId, moduleName, featureKey);
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
 * @param {string} organizationId - Organization ID
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key
 * @returns {Object} { allowed: boolean, message?: string, code?: string, planName?: string }
 */
async function checkPlanFeatureForOrg(organizationId, moduleName, featureKey) {
    try {
        const org = await Organization.findById(organizationId)
            .populate('subscriptionPlanId')
            .lean();

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
        const hasFeature = plan.moduleFeatures &&
                           plan.moduleFeatures.get &&
                           plan.moduleFeatures.get(moduleName)?.get(featureKey) === true;

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
 * @param {Object} user - User object
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key
 * @returns {Object} { allowed: boolean, message?: string }
 */
function checkRoleFeaturePermission(user, moduleName, featureKey) {
    const { role, customRoleId } = user;

    // 1. Check custom role first (highest priority)
    if (customRoleId && customRoleId.permissions) {
        if (customRoleId.permissions[moduleName]?.[featureKey] === true) {
            return { allowed: true };
        }
        // Custom role exists but doesn't have the feature
        return {
            allowed: false,
            message: `Your custom role does not have permission for "${featureKey}" in ${moduleName}.`
        };
    }

    // 2. Check built-in role permissions
    const { getRoleDefaultFeatures } = require('../utils/defaultPermissions');
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

            const planCheck = await checkPlanFeatureForOrg(req.user.organizationId, module, feature);
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

            const planCheck = await checkPlanFeatureForOrg(req.user.organizationId, module, feature);
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
 * Module-level access check (coarse, no feature-level check)
 * Checks if module is enabled in plan AND user has basic view access
 *
 * @param {string} moduleName - Module name
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/products',
 *   checkModuleAccess('products'),
 *   getProducts
 * );
 */
const checkModuleAccess = (moduleName) => {
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

        // Check plan module access
        const planCheck = await checkPlanFeatureForOrg(req.user.organizationId, moduleName, 'view');
        if (!planCheck.allowed) {
            return res.status(403).json({
                status: 'error',
                message: planCheck.message,
                code: planCheck.code,
                reason: 'PLAN'
            });
        }

        // Check role view permission
        const roleCheck = checkRoleFeaturePermission(req.user, moduleName, 'view');
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

module.exports = {
    checkAccess,
    checkAnyAccess,
    checkAllAccess,
    checkModuleAccess
};
