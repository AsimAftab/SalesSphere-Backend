// src/middlewares/plan.middleware.js
// Subscription Plan Feature Check Middleware

const { isSystemRole } = require('../utils/defaultPermissions');
const Organization = require('../api/organizations/organization.model');
const { isValidFeature } = require('../config/featureRegistry');

/**
 * Middleware to check if organization's subscription plan includes a specific feature
 * This is the PLAN-BASED control layer (coarse + fine grained)
 *
 * @param {string} moduleName - Module name (e.g., 'attendance', 'products')
 * @param {string} featureKey - Feature key to check (e.g., 'webCheckIn', 'exportPdf')
 * @returns {Function} Express middleware
 *
 * @example
 * // Check if plan allows web check-in
 * router.post('/attendance/checkin/web', checkPlanFeature('attendance', 'webCheckIn'), webCheckInHandler);
 *
 * // Check if plan allows PDF export
 * router.get('/products/export/pdf', checkPlanFeature('products', 'exportPdf'), exportPdfHandler);
 */
const checkPlanFeature = (moduleName, featureKey) => {
    return async (req, res, next) => {
        // Ensure protect middleware ran first
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required. Please ensure protect middleware runs before plan checks.'
            });
        }

        // 1. SYSTEM ROLES: superadmin/developer bypass plan checks
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

        try {
            // 3. Fetch organization with populated subscription plan
            const org = await Organization.findById(req.user.organizationId)
                .populate('subscriptionPlanId')
                .lean();

            if (!org) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Organization not found. Please contact support.',
                    code: 'ORGANIZATION_NOT_FOUND'
                });
            }

            // 4. Check if subscription is active
            if (org.subscriptionEndDate && new Date() > new Date(org.subscriptionEndDate)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Your subscription has expired. Please renew to continue.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }

            // 5. Check if plan includes this module
            const plan = org.subscriptionPlanId;
            if (!plan) {
                return res.status(403).json({
                    status: 'error',
                    message: 'No subscription plan found. Please contact support.',
                    code: 'NO_SUBSCRIPTION_PLAN'
                });
            }

            // 6. Check if module is enabled in plan
            if (plan.enabledModules && !plan.enabledModules.includes(moduleName)) {
                return res.status(403).json({
                    status: 'error',
                    message: `The ${moduleName} module is not available in your current plan.`,
                    code: 'MODULE_NOT_IN_PLAN',
                    currentPlan: plan.name,
                    requiredModule: moduleName
                });
            }

            // 7. Check if specific feature is enabled in plan's moduleFeatures
            // This is the granular check within the module
            const hasFeature = plan.moduleFeatures &&
                               plan.moduleFeatures.get &&
                               plan.moduleFeatures.get(moduleName)?.get(featureKey) === true;

            if (!hasFeature) {
                return res.status(403).json({
                    status: 'error',
                    message: `The feature "${featureKey}" is not enabled in your current plan.`,
                    code: 'FEATURE_NOT_IN_PLAN',
                    currentPlan: plan.name,
                    requiredFeature: { module: moduleName, feature: featureKey }
                });
            }

            // All checks passed - feature is available in plan!
            return next();

        } catch (error) {
            console.error('Plan feature middleware error:', error);
            return res.status(500).json({
                status: 'error',
                message: 'Error checking plan features. Please try again.',
                code: 'PLAN_CHECK_ERROR'
            });
        }
    };
};

/**
 * Middleware to check if module is enabled (coarse check, no feature-level check)
 * Use this when you only need to verify module access, not specific features
 *
 * @param {string} moduleName - Module name to check
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/products', checkPlanModule('products'), getProducts);
 */
const checkPlanModule = (moduleName) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.'
            });
        }

        // System roles bypass
        if (isSystemRole(req.user.role)) {
            return next();
        }

        try {
            const org = await Organization.findById(req.user.organizationId)
                .populate('subscriptionPlanId')
                .lean();

            if (!org) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Organization not found. Please contact support.',
                    code: 'ORGANIZATION_NOT_FOUND'
                });
            }

            // Check subscription expiry
            if (org.subscriptionEndDate && new Date() > new Date(org.subscriptionEndDate)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Your subscription has expired. Please renew to continue.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }

            const plan = org.subscriptionPlanId;
            if (!plan || (plan.enabledModules && !plan.enabledModules.includes(moduleName))) {
                return res.status(403).json({
                    status: 'error',
                    message: `The ${moduleName} module is not available in your current plan.`,
                    code: 'MODULE_NOT_IN_PLAN',
                    currentPlan: plan?.name || 'Unknown',
                    requiredModule: moduleName
                });
            }

            return next();

        } catch (error) {
            console.error('Plan module middleware error:', error);
            return res.status(500).json({
                status: 'error',
                message: 'Error checking plan modules. Please try again.',
                code: 'PLAN_CHECK_ERROR'
            });
        }
    };
};

/**
 * Middleware to check if ANY of the given features are enabled in the plan
 * User needs at least one feature to be enabled
 *
 * @param {string} moduleName - Module name
 * @param {string[]} featureKeys - Array of feature keys (user needs at least one)
 * @returns {Function} Express middleware
 *
 * @example
 * // Allow if user has either webCheckIn OR mobileCheckIn
 * router.post('/attendance/checkin', checkAnyPlanFeature('attendance', ['webCheckIn', 'mobileCheckIn']), checkInHandler);
 */
const checkAnyPlanFeature = (moduleName, featureKeys) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required.'
            });
        }

        if (isSystemRole(req.user.role)) {
            return next();
        }

        try {
            const org = await Organization.findById(req.user.organizationId)
                .populate('subscriptionPlanId')
                .lean();

            if (!org || !org.subscriptionPlanId) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Organization or subscription plan not found.',
                    code: 'ORGANIZATION_NOT_FOUND'
                });
            }

            // Check subscription expiry
            if (org.subscriptionEndDate && new Date() > new Date(org.subscriptionEndDate)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Your subscription has expired.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }

            const plan = org.subscriptionPlanId;

            // Check if module is enabled
            if (plan.enabledModules && !plan.enabledModules.includes(moduleName)) {
                return res.status(403).json({
                    status: 'error',
                    message: `The ${moduleName} module is not available in your plan.`,
                    code: 'MODULE_NOT_IN_PLAN'
                });
            }

            // Check if ANY of the features are enabled
            const hasAnyFeature = featureKeys.some(featureKey => {
                return plan.moduleFeatures &&
                       plan.moduleFeatures.get &&
                       plan.moduleFeatures.get(moduleName)?.get(featureKey) === true;
            });

            if (!hasAnyFeature) {
                return res.status(403).json({
                    status: 'error',
                    message: `None of the required features are enabled in your plan.`,
                    code: 'NO_FEATURES_ENABLED',
                    requiredFeatures: featureKeys
                });
            }

            return next();

        } catch (error) {
            console.error('Check any plan feature error:', error);
            return res.status(500).json({
                status: 'error',
                message: 'Error checking plan features.',
                code: 'PLAN_CHECK_ERROR'
            });
        }
    };
};

module.exports = {
    checkPlanFeature,
    checkPlanModule,
    checkAnyPlanFeature
};
