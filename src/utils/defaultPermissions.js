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
        viewAllAttendance: true,
        exportPdf: true,
        webCheckIn: true,
        mobileCheckIn: true,
        markHoliday: true,
        updateAttendance: true
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
        exportExcel: true
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewAllProspects: true,
        viewAssigned: true,
        create: true,
        update: true,
        delete: true,
        manageImages: true,
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
        viewAllCollections: true,
        collectPayment: true,
        verifyPayment: true,
        updateChequeStatus: true,
        delete: true
    },
    beatPlan: {
        viewList: true,
        viewOwn: true,
        viewAllBeatPlans: true,
        viewDetails: true,
        viewSalespersons: true,
        viewDirectories: true,
        assign: true,
        startExecution: true,
        markVisit: true,
        optimizeRoute: true,
        calculateDistance: true,
        // Template permissions
        viewListTemplates: true,
        viewDetailsTemplate: true,
        createList: true,
        updateList: true,
        deleteList: true
    },
    tourPlan: {
        viewList: true,
        viewOwn: true,
        viewAllTourPlans: true,
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
        historyPlayback: true
    },
    expenses: {
        viewList: true,
        viewAllClaims: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
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
        viewAllParties: true,
        viewAssigned: true,
        create: true,
        update: true,
        delete: true,
        bulkImport: true,
        exportPdf: true,
        exportExcel: true,
        assign: true
    },
    sites: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewAllSites: true,
        viewAssigned: true,
        create: true,
        update: true,
        delete: true,
        manageImages: true,
        assign: true,
        exportPdf: true,
        exportExcel: true
    },
    dashboard: {
        viewStats: true,
        viewAllPerformance: true,
        viewTeamPerformance: true,
        viewAttendanceSummary: true,
        viewSalesTrend: true
    },
    analytics: {
        viewMonthlyOverview: true,
        viewAllAnalytics: true,
        viewSalesTrend: true,
        viewCategorySales: true,
        viewTopProducts: true,
        viewTopParties: true
    },
    notes: {
        viewList: true,
        viewOwn: true,
        viewAllNotes: true,
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
        viewAllOdometer: true,
        view: true,
        record: true,
        delete: true,
        exportExcel: true
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
        viewAllAttendance: true,
        exportPdf: true,
        webCheckIn: true,
        mobileCheckIn: true,
        markHoliday: true,
        updateAttendance: true
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
        exportExcel: true
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewAllProspects: true,
        viewAssigned: true,
        create: true,
        update: true,
        delete: false,
        manageImages: true,
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
        viewAllCollections: true,
        collectPayment: true,
        verifyPayment: true,
        updateChequeStatus: true,
        delete: false
    },
    beatPlan: {
        viewList: true,
        viewOwn: true,
        viewAllBeatPlans: true,
        viewDetails: true,
        viewSalespersons: true,
        viewDirectories: true,
        assign: true,
        startExecution: true,
        markVisit: true,
        optimizeRoute: true,
        calculateDistance: true,
        // Template permissions
        viewListTemplates: true,
        viewDetailsTemplate: true,
        createList: true,
        updateList: true,
        deleteList: false
    },
    tourPlan: {
        viewList: true,
        viewOwn: true,
        viewAllTourPlans: true,
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
        historyPlayback: true
    },
    expenses: {
        viewList: true,
        viewAllClaims: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true
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
        viewAllParties: true,
        viewAssigned: true,
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
        viewAllSites: true,
        viewAssigned: true,
        viewSubOrganizations: true,
        create: true,
        update: true,
        delete: false,
        manageImages: true,
        assign: true,
        exportPdf: true,
        exportExcel: true
    },
    dashboard: {
        viewStats: true,
        viewAllPerformance: true,
        viewTeamPerformance: true,
        viewAttendanceSummary: true,
        viewSalesTrend: true
    },
    analytics: {
        viewMonthlyOverview: true,
        viewAllAnalytics: true,
        viewSalesTrend: true,
        viewCategorySales: true,
        viewTopProducts: true,
        viewTopParties: true
    },
    notes: {
        viewList: true,
        viewOwn: true,
        viewAllNotes: true,
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
        viewAllMiscellaneous: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: false,
        bulkDelete: false,
        exportPdf: true,
        exportExcel: true
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
        viewAllOdometer: true,
        view: true,
        record: true,
        delete: true,
        exportExcel: true
    },
    siteImages: {
        upload: true,
        delete: true
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
        viewAllAttendance: true,
        exportPdf: true,
        webCheckIn: true,
        mobileCheckIn: true,
        markHoliday: true,
        updateAttendance: true
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
        exportExcel: true
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewAllProspects: true,
        viewAssigned: true,
        create: true,
        update: true,
        delete: true,
        manageImages: true,
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
        viewAllCollections: true,
        collectPayment: true,
        verifyPayment: true,
        updateChequeStatus: true,
        delete: true
    },
    beatPlan: {
        viewList: true,
        viewOwn: true,
        viewAllBeatPlans: true,
        viewDetails: true,
        viewSalespersons: true,
        viewDirectories: true,
        assign: true,
        startExecution: true,
        markVisit: true,
        optimizeRoute: true,
        calculateDistance: true,
        // Template permissions
        viewListTemplates: true,
        viewDetailsTemplate: true,
        createList: true,
        updateList: true,
        deleteList: true
    },
    tourPlan: {
        viewList: true,
        viewOwn: true,
        viewAllTourPlans: true,
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
        historyPlayback: true
    },
    expenses: {
        viewList: true,
        viewAllClaims: true,
        viewDetails: true,
        create: true,
        update: true,
        updateStatus: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
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
        viewAllParties: true,
        viewAssigned: true,
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
        viewAllSites: true,
        viewAssigned: true,
        viewSubOrganizations: true,
        create: true,
        update: true,
        delete: true,
        manageImages: true,
        assign: true,
        exportPdf: true,
        exportExcel: true
    },
    dashboard: {
        viewStats: true,
        viewAllPerformance: true,
        viewTeamPerformance: true,
        viewAttendanceSummary: true,
        viewSalesTrend: true
    },
    analytics: {
        viewMonthlyOverview: true,
        viewAllAnalytics: true,
        viewSalesTrend: true,
        viewCategorySales: true,
        viewTopProducts: true,
        viewTopParties: true
    },
    notes: {
        viewList: true,
        viewOwn: true,
        viewAllNotes: true,
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
        viewAllMiscellaneous: true,
        viewDetails: true,
        create: true,
        update: true,
        delete: true,
        bulkDelete: true,
        exportPdf: true,
        exportExcel: true
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
        viewAllOdometer: true,
        view: true,
        record: true,
        delete: true,
        exportExcel: true
    },
    siteImages: {
        upload: true,
        delete: true
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
        webCheckIn: true,
        mobileCheckIn: true,
        markHoliday: false,
        updateAttendance: false
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
        exportExcel: false
    },
    prospects: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewAllProspects: false,
        viewAssigned: true,
        create: true,
        update: true,
        delete: false,
        manageImages: true,
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
        viewAllInvoices: false,
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
        assign: false,
        startExecution: true,
        markVisit: true,
        optimizeRoute: false,
        calculateDistance: true,
        // Template permissions (users don't manage templates)
        viewListTemplates: false,
        viewDetailsTemplate: false,
        createList: false,
        updateList: false,
        deleteList: false
    },
    tourPlan: {
        viewList: false,
        viewOwn: true,
        viewAllTourPlans: false,
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
        viewSessionHistory: true,
        viewCurrentLocation: false,
        historyPlayback: true
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
        exportExcel: false
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
        viewAllParties: false,
        viewAssigned: true,
        create: false,
        update: false,
        delete: false,
        bulkImport: false,
        exportPdf: false,
        exportExcel: false,
        assign: false
    },
    sites: {
        viewList: true,
        viewDetails: true,
        viewOwn: true,
        viewAllSites: false,
        viewAssigned: true,
        viewSubOrganizations: true,
        create: false,
        update: false,
        delete: false,
        manageImages: true,
        assign: false,
        exportPdf: false,
        exportExcel: false
    },
    dashboard: {
        viewStats: true,
        viewTeamPerformance: true,
        viewAttendanceSummary: true,
        viewSalesTrend: true
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
        viewAllOdometer: false,
        view: true,
        record: true,
        delete: false,
        exportExcel: false
    },
    siteImages: {
        upload: true,
        delete: false
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
