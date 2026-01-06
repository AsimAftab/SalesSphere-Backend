// src/utils/defaultPermissions.js
// Granular feature-based default permissions for the RBAC system

const { FEATURE_REGISTRY } = require('../config/featureRegistry');

// ============================================
// ALL MODULES LIST (from FEATURE_REGISTRY)
// ============================================
const ALL_MODULES = Object.keys(FEATURE_REGISTRY);

// System-level modules (not in registry)
const SYSTEM_MODULES = ['organizations', 'systemUsers', 'subscriptions'];

// ============================================
// ROLE CLASSIFICATION
// ============================================
const SYSTEM_ROLES = ['superadmin', 'developer'];
const ORGANIZATION_ROLES = ['admin', 'user'];

// ============================================
// GRANULAR FEATURE-BASED DEFAULT PERMISSIONS
// ============================================

/**
 * ADMIN GRANULAR DEFAULT PERMISSIONS
 * Admins have ALL features enabled for all modules
 */
const ADMIN_GRANULAR_PERMISSIONS = {
    attendance: {
        viewMyAttendance: true,
        viewTeamAttendance: true,
        webCheckIn: true,
        mobileCheckIn: true,
        remoteCheckIn: true,
        markHoliday: true,
        markAbsentees: true,
        biometricSync: true
    },
    products: {
        view: true,
        create: true,
        update: true,
        delete: true,
        bulkImport: true,
        bulkDelete: true,
        exportPdf: true
    },
    prospects: {
        view: true,
        create: true,
        update: true,
        delete: true,
        transfer: true,
        manageCategories: true,
        import: true
    },
    orderLists: {
        view: true,
        createEstimate: true,
        createInvoice: true,
        convertToInvoice: true,
        editStatus: true,
        delete: true,
        bulkDelete: true
    },
    collections: {
        view: true,
        collectPayment: true,
        verifyPayment: true,
        updateChequeStatus: true,
        delete: true
    },
    beatPlan: {
        view: true,
        create: true,
        assign: true,
        edit: true,
        delete: true,
        adhocVisits: true
    },
    tourPlan: {
        view: true,
        create: true,
        approve: true,
        edit: true,
        delete: true
    },
    liveTracking: {
        view: true,
        historyPlayback: true
    },
    expenses: {
        viewList: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true,
        uploadReceipt: true,
        // Category management
        viewCategories: true,
        createCategory: true,
        updateCategory: true,
        deleteCategory: true
    },
    leaves: {
        view: true,
        viewOwn: true,
        viewTeam: true,
        apply: true,
        approve: true
    },
    parties: {
        view: true,
        create: true,
        update: true,
        delete: true,
        import: true,
        exportPdf: true
    },
    sites: {
        view: true,
        create: true,
        update: true,
        delete: true,
        assign: true
    },
    dashboard: {
        view: true,
        viewOwnStats: true,
        viewTeamStats: true,
        viewOrgStats: true
    },
    analytics: {
        view: true,
        salesReports: true,
        performanceReports: true,
        attendanceReports: true,
        customReports: true,
        exportReports: true
    },
    notes: {
        view: true,
        create: true,
        update: true,
        delete: true,
        share: true
    },
    miscellaneousWork: {
        view: true,
        create: true,
        update: true,
        delete: true,
        approve: true
    },
    settings: {
        view: true,
        manage: true,
        manageUsers: true,
        manageRoles: true,
        manageSubscription: true
    },
    employees: {
        view: true,
        viewOwn: true,
        create: true,
        update: true,
        delete: true,
        assignSupervisor: true
    },
    odometer: {
        view: true,
        create: true,
        update: true,
        approve: true
    }
};

/**
 * USER GRANULAR DEFAULT PERMISSIONS
 * Users have limited permissions - mostly view and self-service actions
 */
const USER_GRANULAR_PERMISSIONS = {
    attendance: {
        viewMyAttendance: true,
        viewTeamAttendance: false,
        webCheckIn: true,
        mobileCheckIn: true,
        remoteCheckIn: false,
        markHoliday: false,
        markAbsentees: false,
        biometricSync: false
    },
    products: {
        view: true,
        create: false,
        update: false,
        delete: false,
        bulkImport: false,
        bulkDelete: false,
        exportPdf: false
    },
    prospects: {
        view: true,
        create: true,
        update: true,
        delete: false,
        transfer: false,
        manageCategories: false,
        import: false
    },
    orderLists: {
        view: true,
        createEstimate: true,
        createInvoice: true,
        convertToInvoice: false,
        editStatus: false,
        delete: false,
        bulkDelete: false
    },
    collections: {
        view: true,
        collectPayment: true,
        verifyPayment: false,
        updateChequeStatus: false,
        delete: false
    },
    beatPlan: {
        view: true,
        create: false,
        assign: false,
        edit: false,
        delete: false,
        adhocVisits: false
    },
    tourPlan: {
        view: true,
        create: true,
        approve: false,
        edit: false,
        delete: false
    },
    liveTracking: {
        view: false,
        historyPlayback: false
    },
    expenses: {
        viewList: true,
        viewDetails: true,
        create: true,
        update: false,
        updateStatus: false,
        delete: false,
        bulkDelete: false,
        exportPdf: false,
        exportExcel: false,
        uploadReceipt: true,
        // Category management
        viewCategories: true,    // Can view (needed to create expenses)
        createCategory: false,   // Cannot create categories
        updateCategory: false,   // Cannot edit categories
        deleteCategory: false    // Cannot delete categories
    },
    leaves: {
        view: true,
        viewOwn: true,
        viewTeam: false,
        apply: true,
        approve: false
    },
    parties: {
        view: true,
        create: false,
        update: false,
        delete: false,
        import: false,
        exportPdf: false
    },
    sites: {
        view: true,
        create: false,
        update: false,
        delete: false,
        assign: false
    },
    dashboard: {
        view: true,
        viewOwnStats: true,
        viewTeamStats: false,
        viewOrgStats: false
    },
    analytics: {
        view: false,
        salesReports: false,
        performanceReports: false,
        attendanceReports: false,
        customReports: false,
        exportReports: false
    },
    notes: {
        view: true,
        create: true,
        update: false,
        delete: false,
        share: false
    },
    miscellaneousWork: {
        view: true,
        create: false,
        update: false,
        delete: false,
        approve: false
    },
    settings: {
        view: false,
        manage: false,
        manageUsers: false,
        manageRoles: false,
        manageSubscription: false
    },
    employees: {
        view: false,
        viewOwn: true,
        create: false,
        update: false,
        delete: false,
        assignSupervisor: false
    },
    odometer: {
        view: true,
        create: true,
        update: false,
        approve: false
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if role is a system role
 */
const isSystemRole = (role) => SYSTEM_ROLES.includes(role);

/**
 * Check if role is an organization role
 */
const isOrganizationRole = (role) => ORGANIZATION_ROLES.includes(role);

/**
 * Get all available modules
 */
const getAllModules = () => ALL_MODULES;

/**
 * Create all-true permissions for a module's features
 */
const createAllFeaturesEnabled = (moduleName) => {
    const features = FEATURE_REGISTRY[moduleName] || {};
    const perms = {};
    for (const key of Object.keys(features)) {
        perms[key] = true;
    }
    return perms;
};

/**
 * Create all-false permissions for a module's features
 */
const createAllFeaturesDisabled = (moduleName) => {
    const features = FEATURE_REGISTRY[moduleName] || {};
    const perms = {};
    for (const key of Object.keys(features)) {
        perms[key] = false;
    }
    return perms;
};

/**
 * Create empty permissions for all modules
 */
const createEmptyPermissions = () => {
    const permissions = {};
    for (const moduleName of ALL_MODULES) {
        permissions[moduleName] = createAllFeaturesDisabled(moduleName);
    }
    return permissions;
};

/**
 * Get granular feature permissions for a role
 * @param {string} role - Role name ('admin', 'user', etc.)
 * @param {string} moduleName - Module name (optional, returns all if not provided)
 * @returns {Object} Granular permissions
 */
const getRoleDefaultFeatures = (role, moduleName) => {
    const granularPerms = {
        admin: ADMIN_GRANULAR_PERMISSIONS,
        user: USER_GRANULAR_PERMISSIONS
    };

    const rolePerms = granularPerms[role];

    if (moduleName) {
        return rolePerms?.[moduleName] || {};
    }

    return rolePerms || {};
};

/**
 * Check if role has a specific feature permission
 * @param {string} role - Role name
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key
 * @returns {boolean}
 */
const hasRoleFeaturePermission = (role, moduleName, featureKey) => {
    const roleFeatures = getRoleDefaultFeatures(role, moduleName);
    return roleFeatures?.[featureKey] === true;
};

module.exports = {
    // Granular permissions
    ADMIN_GRANULAR_PERMISSIONS,
    USER_GRANULAR_PERMISSIONS,

    // Module lists
    ALL_MODULES,
    SYSTEM_MODULES,

    // Role classification
    SYSTEM_ROLES,
    ORGANIZATION_ROLES,

    // Helper functions
    isSystemRole,
    isOrganizationRole,
    getAllModules,
    createAllFeaturesEnabled,
    createAllFeaturesDisabled,
    createEmptyPermissions,
    getRoleDefaultFeatures,
    hasRoleFeaturePermission
};
