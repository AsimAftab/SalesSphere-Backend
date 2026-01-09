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
 * SUPERADMIN GRANULAR DEFAULT PERMISSIONS
 * Superadmin has ALL features enabled for all modules (including delete)
 */
const SUPERADMIN_GRANULAR_PERMISSIONS = {
    attendance: {
        viewMyAttendance: true,
        viewTeamAttendance: true,
        exportPdf: true,
        exportExcel: true,
        webCheckIn: true,
        mobileCheckIn: true,
        remoteCheckIn: true,
        markHoliday: true,
        updateAttendance: true,
        biometricSync: true
    },
    products: {
        viewList: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkUpload: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true,
        viewCategories: true
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamProspects: true,
        viewAllProspects: true,
        viewAssigned: true,
        viewInterests: true,
        create: true,
        update: true,
        delete: true,
        transferToParty: true,
        import: true,
        exportPdf: true,
        exportExcel: true,
        assign: true
    },
    estimates: {
        viewList: true,
        viewDetails: true,
        create: true,
        convertToInvoice: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportDetailPdf: true
    },
    invoices: {
        viewList: true,
        viewDetails: true,
        create: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        viewPartyStats: true,
        exportPdf: true,
        exportDetailPdf: true
    },
    collections: {
        view: true,
        viewTeamCollections: true,
        collectPayment: true,
        verifyPayment: true,
        updateChequeStatus: true,
        delete: true
    },
    beatPlan: {
        viewList: true,
        viewOwn: true,
        viewTeamBeatPlans: true,
        viewDetails: true,
        viewSalespersons: true,
        viewDirectories: true,
        create: true,
        update: true,
        startExecution: true,
        markVisit: true,
        optimizeRoute: true,
        calculateDistance: true,
        delete: true
    },
    tourPlan: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    liveTracking: {
        viewLocations: true,
        viewLiveTracking: true,
        viewActiveSessions: true,
        viewSessionHistory: true,
        viewCurrentLocation: true,
        historyPlayback: true,
        deleteSession: true
    },
    expenses: {
        viewList: true,
        viewTeamClaims: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true,
        uploadReceipt: true,
        viewCategories: true,
        createCategory: true,
        updateCategory: true,
        deleteCategory: true
    },
    leaves: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    parties: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamParties: true,
        viewAllParties: true,
        viewAssigned: true,
        viewTypes: true,
        create: true,
        update: true,
        delete: true,
        bulkImport: true,
        exportPdf: true,
        exportExcel: true,
        viewOrders: true,
        assign: true
    },
    sites: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamSites: true,
        viewAllSites: true,
        viewAssigned: true,
        viewInterests: true,
        viewSubOrganizations: true,
        create: true,
        update: true,
        delete: true,
        assign: true,
        exportPdf: true,
        exportExcel: true
    },
    dashboard: {
        viewStats: true,
        viewTeamPerformance: true,
        viewAttendanceSummary: true,
        viewSalesTrend: true
    },
    analytics: {
        viewMonthlyOverview: true,
        viewTeamAnalytics: true,
        viewSalesTrend: true,
        viewCategorySales: true,
        viewTopProducts: true,
        viewTopParties: true
    },
    notes: {
        viewList: true,
        viewOwn: true,
        viewTeamNotes: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    miscellaneousWork: {
        viewList: true,
        viewOwn: true,
        viewTeamMiscellaneous: false,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    settings: {
        view: true,
        manage: true,
        manageUsers: true,
        manageRoles: true,
        manageSubscription: true
    },
    employees: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        assignSupervisor: true,
        viewAttendance: true,
        uploadDocuments: true,
        deleteDocuments: true,
        exportPdf: true,
        exportExcel: true
    },
    odometer: {
        view: true,
        create: true,
        update: true,
        approve: true
    },
    // System modules (superadmin only)
    systemUsers: {
        viewList: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true
    },
    organizations: {
        view: true,
        create: true,
        update: true,
        delete: true
    },
    subscriptions: {
        view: true,
        create: true,
        update: true,
        delete: true
    }
};

/**
 * DEVELOPER GRANULAR DEFAULT PERMISSIONS
 * Developer has ALL features enabled for all modules EXCEPT delete
 */
const DEVELOPER_GRANULAR_PERMISSIONS = {
    attendance: {
        viewMyAttendance: true,
        viewTeamAttendance: true,
        exportPdf: true,
        exportExcel: true,
        webCheckIn: true,
        mobileCheckIn: true,
        remoteCheckIn: true,
        markHoliday: true,
        updateAttendance: true,
        biometricSync: true
    },
    products: {
        viewList: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: false,
        bulkUpload: true,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true,
        viewCategories: true
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamProspects: true,
        viewAllProspects: true,
        viewAssigned: true,
        viewInterests: true,
        create: true,
        update: true,
        delete: false,
        transferToParty: true,
        import: true,
        exportPdf: true,
        exportExcel: true,
        assign: true
    },
    estimates: {
        viewList: true,
        viewDetails: true,
        create: true,
        convertToInvoice: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportDetailPdf: true
    },
    invoices: {
        viewList: true,
        viewDetails: true,
        create: true,
        updateStatus: true,
        delete: false,
        bulkDelete: false,
        viewPartyStats: true,
        exportPdf: true,
        exportDetailPdf: true
    },
    collections: {
        view: true,
        viewTeamCollections: true,
        collectPayment: true,
        verifyPayment: true,
        updateChequeStatus: true,
        delete: false
    },
    beatPlan: {
        viewList: true,
        viewOwn: true,
        viewTeamBeatPlans: true,
        viewDetails: true,
        viewSalespersons: true,
        viewDirectories: true,
        create: true,
        update: true,
        startExecution: true,
        markVisit: true,
        optimizeRoute: true,
        calculateDistance: true,
        delete: false
    },
    tourPlan: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true
    },
    liveTracking: {
        viewLocations: true,
        viewLiveTracking: true,
        viewActiveSessions: true,
        viewSessionHistory: true,
        viewCurrentLocation: true,
        historyPlayback: true,
        deleteSession: false
    },
    expenses: {
        viewList: true,
        viewTeamClaims: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true,
        uploadReceipt: true,
        viewCategories: true,
        createCategory: true,
        updateCategory: true,
        deleteCategory: false
    },
    leaves: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true
    },
    parties: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamParties: true,
        viewAllParties: true,
        viewAssigned: true,
        viewTypes: true,
        create: true,
        update: true,
        delete: false,
        bulkImport: true,
        exportPdf: true,
        exportExcel: true,
        viewOrders: true,
        assign: true
    },
    sites: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamSites: true,
        viewAllSites: true,
        viewAssigned: true,
        viewInterests: true,
        viewSubOrganizations: true,
        create: true,
        update: true,
        delete: false,
        assign: true,
        exportPdf: true,
        exportExcel: true
    },
    dashboard: {
        viewStats: true,
        viewTeamPerformance: true,
        viewAttendanceSummary: true,
        viewSalesTrend: true
    },
    analytics: {
        viewMonthlyOverview: true,
        viewTeamAnalytics: true,
        viewSalesTrend: true,
        viewCategorySales: true,
        viewTopProducts: true,
        viewTopParties: true
    },
    notes: {
        viewList: true,
        viewOwn: true,
        viewTeamNotes: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true
    },
    miscellaneousWork: {
        viewList: true,
        viewOwn: true,
        viewTeamMiscellaneous: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true
    },
    settings: {
        view: true,
        manage: true,
        manageUsers: true,
        manageRoles: true,
        manageSubscription: true
    },
    employees: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: false,
        assignSupervisor: true,
        viewAttendance: true,
        uploadDocuments: true,
        deleteDocuments: false,
        exportPdf: true,
        exportExcel: true
    },
    odometer: {
        view: true,
        create: true,
        update: true,
        approve: true
    },
    // System modules (superadmin/developer)
    systemUsers: {
        viewList: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: false
    },
    organizations: {
        view: true,
        create: false,
        update: false,
        delete: false
    },
    subscriptions: {
        view: true,
        create: false,
        update: false,
        delete: false
    }
};

/**
 * ADMIN GRANULAR DEFAULT PERMISSIONS
 * Admins have ALL features enabled for all modules
 */
const ADMIN_GRANULAR_PERMISSIONS = {
    attendance: {
        viewMyAttendance: true,
        viewTeamAttendance: true,
        exportPdf: true,
        exportExcel: true,
        webCheckIn: true,
        mobileCheckIn: true,
        remoteCheckIn: true,
        markHoliday: true,
        updateAttendance: true,
        biometricSync: true
    },
    products: {
        viewList: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkUpload: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true,
        viewCategories: true
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamProspects: true,
        viewAllProspects: true,
        viewAssigned: true,
        viewInterests: true,
        create: true,
        update: true,
        delete: true,
        transferToParty: true,
        import: true,
        exportPdf: true,
        exportExcel: true,
        assign: true
    },
    // Estimates (quotes) module
    estimates: {
        viewList: true,
        viewDetails: true,
        create: true,
        convertToInvoice: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportDetailPdf: true
    },
    // Invoices (orders) module
    invoices: {
        viewList: true,
        viewDetails: true,
        create: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        viewPartyStats: true,
        exportPdf: true,
        exportDetailPdf: true
    },
    collections: {
        view: true,
        viewTeamCollections: true,
        collectPayment: true,
        verifyPayment: true,
        updateChequeStatus: true,
        delete: true
    },
    beatPlan: {
        viewList: true,
        viewOwn: true,
        viewTeamBeatPlans: true,
        viewDetails: true,
        viewSalespersons: true,
        viewDirectories: true,
        create: true,
        update: true,
        startExecution: true,
        markVisit: true,
        optimizeRoute: true,
        calculateDistance: true,
        delete: true
    },
    tourPlan: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    liveTracking: {
        viewLocations: true,
        viewLiveTracking: true,
        viewActiveSessions: true,
        viewSessionHistory: true,
        viewCurrentLocation: true,
        historyPlayback: true,
        deleteSession: true
    },
    expenses: {
        viewList: true,
        viewTeamClaims: true,
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
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    parties: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamParties: true,
        viewAllParties: true,
        viewAssigned: true,
        viewTypes: true,
        create: true,
        update: true,
        delete: true,
        bulkImport: true,
        exportPdf: true,
        exportExcel: true,
        viewOrders: true,
        assign: true
    },
    sites: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamSites: true,
        viewAllSites: true,
        viewAssigned: true,
        viewInterests: true,
        viewSubOrganizations: true,
        create: true,
        update: true,
        delete: true,
        assign: true,
        exportPdf: true,
        exportExcel: true
    },
    dashboard: {
        viewStats: true,
        viewTeamPerformance: true,
        viewAttendanceSummary: true,
        viewSalesTrend: true
    },
    analytics: {
        viewMonthlyOverview: true,
        viewTeamAnalytics: true,
        viewSalesTrend: true,
        viewCategorySales: true,
        viewTopProducts: true,
        viewTopParties: true
    },
    notes: {
        viewList: true,
        viewOwn: true,
        viewTeamNotes: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    miscellaneousWork: {
        viewList: true,
        viewOwn: true,
        viewTeamMiscellaneous: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
    },
    settings: {
        view: true,
        manage: true,
        manageUsers: true,
        manageRoles: true,
        manageSubscription: true
    },
    employees: {
        viewList: true,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        assignSupervisor: true,
        viewAttendance: true,
        uploadDocuments: true,
        deleteDocuments: true,
        exportPdf: true,
        exportExcel: true
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
        exportPdf: false,
        exportExcel: false,
        webCheckIn: true,
        mobileCheckIn: true,
        remoteCheckIn: false,
        markHoliday: false,
        updateAttendance: false,
        biometricSync: false
    },
    products: {
        viewList: true,
        viewDetails: true,
        create: false,
        update: false,
        delete: false,
        bulkUpload: false,
        bulkDelete: false,
        exportPdf: false,
        exportExcel: false,
        viewCategories: true
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamProspects: false,
        viewAllProspects: false,
        viewAssigned: true,
        viewInterests: true,
        create: true,
        update: true,
        delete: false,
        transferToParty: false,
        import: false,
        exportPdf: false,
        exportExcel: false,
        assign: false
    },
    // Estimates (quotes) module
    estimates: {
        viewList: true,
        viewDetails: true,
        create: true,
        convertToInvoice: false,
        delete: false,
        bulkDelete: false,
        exportPdf: false,
        exportDetailPdf: false
    },
    // Invoices (orders) module
    invoices: {
        viewList: true,
        viewTeamInvoices: false,
        viewDetails: true,
        create: true,
        updateStatus: false,
        delete: false,
        bulkDelete: false,
        viewPartyStats: false,
        exportPdf: false,
        exportDetailPdf: false
    },
    collections: {
        view: true,
        viewTeamCollections: false,
        collectPayment: true,
        verifyPayment: false,
        updateChequeStatus: false,
        delete: false
    },
    beatPlan: {
        viewList: false,
        viewOwn: true,
        viewTeamBeatPlans: false,
        viewDetails: true,
        viewSalespersons: false,
        viewDirectories: true,
        create: false,
        update: false,
        startExecution: true,
        markVisit: true,
        optimizeRoute: false,
        calculateDistance: true,
        delete: false
    },
    tourPlan: {
        viewList: false,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: false,
        delete: true,
        bulkDelete: false,
        exportPdf: false,
        exportExcel: false
    },
    liveTracking: {
        viewLocations: true,
        viewLiveTracking: false,
        viewActiveSessions: false,
        viewSessionHistory: false,
        viewCurrentLocation: false,
        historyPlayback: false,
        deleteSession: false
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
        viewList: false,
        viewOwn: true,
        viewTeamLeaves: false,
        viewDetails: true,
        create: true,
        update: false,
        updateStatus: false,
        delete: false,
        bulkDelete: false,
        exportPdf: false,
        exportExcel: false
    },
    parties: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamParties: false,
        viewAllParties: false,
        viewAssigned: true,
        viewTypes: true,
        create: false,
        update: false,
        delete: false,
        bulkImport: false,
        exportPdf: false,
        exportExcel: false,
        viewOrders: true,
        assign: false
    },
    sites: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewTeamSites: false,
        viewAllSites: false,
        viewAssigned: true,
        viewInterests: true,
        viewSubOrganizations: true,
        create: false,
        update: false,
        delete: false,
        assign: false,
        exportPdf: false,
        exportExcel: false
    },
    dashboard: {
        viewStats: true,
        viewTeamPerformance: false,
        viewAttendanceSummary: false,
        viewSalesTrend: false
    },
    analytics: {
        viewMonthlyOverview: false,
        viewSalesTrend: false,
        viewCategorySales: false,
        viewTopProducts: false,
        viewTopParties: false
    },
    notes: {
        viewList: false,
        viewOwn: true,
        viewTeamNotes: false,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkDelete: false,
        exportPdf: false,
        exportExcel: false
    },
    miscellaneousWork: {
        viewList: false,
        viewOwn: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: false,
        bulkDelete: false,
        exportPdf: false,
        exportExcel: false
    },
    settings: {
        view: false,
        manage: false,
        manageUsers: false,
        manageRoles: false,
        manageSubscription: false
    },
    employees: {
        viewList: false,
        viewOwn: true,
        viewDetails: false,
        create: false,
        update: false,
        delete: false,
        assignSupervisor: false,
        viewAttendance: false,
        uploadDocuments: false,
        deleteDocuments: false,
        exportPdf: false,
        exportExcel: false
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
