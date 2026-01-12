/**
 * Plan Registry - Subscription Plan Definitions
 *
 * ADDITIVE (WHITELISTING) APPROACH
 * - Explicitly define what EACH tier gets
 * - New features are NEVER granted by accident
 * - Safe: "Additive = Opt-In, Subtractive = Opt-Out"
 *
 * Used by:
 * - seedSubscriptionPlans.js (database seeding)
 * - Signup flows (plan validation)
 * - Frontend configuration endpoints
 */

const { FEATURE_REGISTRY } = require('./featureRegistry');

// ==========================================
// 1. FEATURE BUCKETS (Building Blocks)
// ==========================================

/**
 * COMMON_FEATURES
 * Foundation features that EVERY tier gets
 * These are your essential self-service features
 */
const COMMON_FEATURES = {
    attendance: ['viewMyAttendance', 'webCheckIn', 'mobileCheckIn'],
    products: ['viewList', 'viewDetails', 'viewCategories'],
    leaves: ['viewList', 'viewOwn', 'viewDetails', 'create'],
    dashboard: ['viewStats'],
    employees: ['viewOwn'],
    odometer: ['view']
};

/**
 * STANDARD_UPGRADES
 * Features that Standard tier adds on top of Basic
 * Basic users DO NOT get these unless explicitly added here
 */
const STANDARD_UPGRADES = {
    // Attendance: Admin controls
    attendance: ['viewTeamAttendance', 'markHoliday', 'updateAttendance', 'biometricSync'],

    // Products: CRUD operations (still no delete/bulk)
    products: ['create', 'update'],

    // Leaves: Approval workflow
    leaves: ['update', 'updateStatus'],

    // Parties: Basic CRM
    parties: ['viewList', 'viewDetails'],

    // Prospects: Lead management
    prospects: ['viewList', 'viewDetails', 'create', 'update', 'transferToParty'],

    // Sites: Location management + image upload (Standard+)
    sites: ['viewList', 'viewDetails', 'uploadImage', 'deleteImage'],

    // Invoicing: Basic billing
    invoices: ['viewList', 'viewDetails', 'create', 'updateStatus'],
    estimates: ['viewList', 'viewDetails', 'create', 'update', 'convertToInvoice'],

    // Collections: Payment tracking
    collections: ['view', 'collectPayment'],

    // Beat plans: Route planning
    beatPlan: ['viewList', 'viewOwn', 'viewDetails', 'viewSalespersons', 'viewDirectories'],
    tourPlan: ['viewList', 'viewOwn', 'viewDetails', 'create', 'update', 'startExecution', 'markVisit'],

    // Notes: Basic note-taking
    notes: ['viewList', 'viewOwn', 'viewDetails', 'create', 'update'],

    // Expenses: Submit expenses
    expenses: ['viewList', 'viewDetails', 'create'],

    // Misc work
    miscellaneousWork: ['viewList', 'viewOwn', 'viewDetails', 'create', 'update'],

    // Odometer: Record readings
    odometer: ['record']
};

/**
 * PREMIUM_UPGRADES
 * High-value features that only Premium tier gets
 * Standard users DO NOT get these unless explicitly added here
 */
const PREMIUM_UPGRADES = {
    // Attendance: Exports
    attendance: ['exportPdf', 'exportExcel'],

    // Products: High-value tools
    products: ['delete', 'bulkUpload', 'bulkDelete', 'exportPdf', 'exportExcel'],

    // Leaves: Bulk operations & exports
    leaves: ['delete', 'bulkDelete', 'exportPdf', 'exportExcel'],

    // Parties: Full CRM + bulk operations
    parties: ['create', 'update', 'delete', 'bulkImport', 'exportPdf', 'exportExcel', 'viewOrders', 'assign'],

    // Prospects: Full lead management
    prospects: ['delete', 'import', 'exportPdf', 'exportExcel', 'assign'],

    // Sites: Full location management
    sites: ['create', 'update', 'delete', 'assign', 'exportPdf', 'exportExcel'],

    // Invoicing: Full billing + exports
    invoices: ['create', 'delete', 'bulkDelete', 'viewPartyStats', 'exportPdf', 'exportDetailPdf'],
    estimates: ['delete', 'bulkDelete', 'exportPdf', 'exportDetailPdf'],

    // Collections: Full payment control
    collections: ['verifyPayment', 'updateChequeStatus', 'delete'],

    // Beat plans: Full execution
    beatPlan: ['create', 'update', 'startExecution', 'markVisit', 'optimizeRoute', 'calculateDistance', 'delete'],

    // Tour plans: Full management
    tourPlan: ['updateStatus', 'delete', 'bulkDelete', 'exportPdf', 'exportExcel'],

    // Analytics: Business intelligence
    analytics: ['viewMonthlyOverview', 'viewSalesTrend', 'viewCategorySales', 'viewTopProducts', 'viewTopParties'],

    // Live tracking: Real-time location
    liveTracking: ['viewLocations', 'viewLiveTracking', 'viewActiveSessions', 'viewSessionHistory', 'viewCurrentLocation', 'historyPlayback'],

    // Notes: Full note management
    notes: ['delete', 'bulkDelete', 'exportPdf', 'exportExcel'],

    // Misc work: Full management
    miscellaneousWork: ['delete', 'bulkDelete', 'exportPdf', 'exportExcel'],

    // Expenses: Full expense management
    expenses: ['viewAllClaims', 'update', 'updateStatus', 'delete', 'bulkDelete', 'exportPdf', 'exportExcel'],

    // Dashboard: Full insights
    dashboard: ['viewTeamPerformance', 'viewAttendanceSummary', 'viewSalesTrend'],

    // Employees: Full management
    employees: ['viewList', 'viewDetails', 'create', 'update', 'delete', 'assignSupervisor', 'viewAttendance', 'uploadDocuments', 'deleteDocuments', 'exportPdf', 'exportExcel'],

    // Odometer: Full management + exports
    odometer: ['viewAllOdometer', 'delete', 'exportExcel']
};

// ==========================================
// 2. HELPERS
// ==========================================

/**
 * Merges multiple feature buckets into one feature map
 * Later buckets override earlier buckets for conflicts (rare)
 *
 * @param  {...Object} buckets - Feature buckets to merge
 * @return {Object} Combined moduleFeatures format
 */
const mergeFeatures = (...buckets) => {
    const combined = {};

    buckets.forEach(bucket => {
        Object.entries(bucket).forEach(([module, features]) => {
            if (!Array.isArray(features)) {
                // Handle nested object format if needed
                features = Object.keys(features);
            }

            if (!combined[module]) {
                combined[module] = {};
            }

            features.forEach(key => {
                combined[module][key] = true;
            });
        });
    });

    return combined;
};

/**
 * Gets all modules from a feature bucket
 * Used for enabledModules array in plans
 *
 * @param  {Object} featureBucket - Feature bucket object
 * @return {string[]} Array of module names
 */
const getModulesFromBucket = (featureBucket) => {
    return Object.keys(featureBucket);
};

// Modules that should NEVER be included in organization subscription plans
// These are system-level modules for superadmin/developer only
const SYSTEM_ONLY_MODULES = ['systemUsers'];

/**
 * Generates a feature map with ALL features enabled (excluding system-only modules)
 * Used for Premium plan which gets everything available to organizations
 *
 * @return {Object} All organization features set to true
 */
const getAllFeatures = () => {
    const features = {};
    for (const [moduleName, moduleKeys] of Object.entries(FEATURE_REGISTRY)) {
        // Skip system-only modules
        if (SYSTEM_ONLY_MODULES.includes(moduleName)) continue;

        features[moduleName] = {};
        for (const key of Object.keys(moduleKeys)) {
            features[moduleName][key] = true;
        }
    }
    return features;
};

// ==========================================
// 3. PLAN DEFINITIONS
// ==========================================

const DEFAULT_PLANS = [
    {
        name: 'Basic',
        tier: 'basic',
        description: 'Essential features for small teams',
        maxEmployees: 5,
        price: { amount: 2999, currency: 'INR', billingCycle: 'yearly' },
        enabledModules: getModulesFromBucket(COMMON_FEATURES),
        // Logic: ONLY Common features. Safe - new features require explicit opt-in.
        moduleFeatures: mergeFeatures(COMMON_FEATURES),
        isSystemPlan: true
    },
    {
        name: 'Standard',
        tier: 'standard',
        description: 'Advanced features for growing businesses',
        maxEmployees: 25,
        price: { amount: 7999, currency: 'INR', billingCycle: 'yearly' },
        enabledModules: getModulesFromBucket(mergeFeatures(COMMON_FEATURES, STANDARD_UPGRADES)),
        // Logic: Common + Standard Upgrades. Safe - Premium features still excluded.
        moduleFeatures: mergeFeatures(COMMON_FEATURES, STANDARD_UPGRADES),
        isSystemPlan: true
    },
    {
        name: 'Premium',
        tier: 'premium',
        description: 'Full access with analytics and live tracking',
        maxEmployees: 50,
        price: { amount: 14999, currency: 'INR', billingCycle: 'yearly' },
        // Exclude system-only modules from organization plans
        enabledModules: Object.keys(FEATURE_REGISTRY).filter(m => !SYSTEM_ONLY_MODULES.includes(m)),
        // Logic: Gets EVERYTHING auto-generated from registry (except system modules)
        moduleFeatures: getAllFeatures(),
        isSystemPlan: true
    }
];

// ==========================================
// 4. EXPORTS
// ==========================================

module.exports = {
    // Feature Buckets
    COMMON_FEATURES,
    STANDARD_UPGRADES,
    PREMIUM_UPGRADES,

    // Helpers
    mergeFeatures,
    getModulesFromBucket,
    getAllFeatures,

    // Plan definitions
    DEFAULT_PLANS
};
