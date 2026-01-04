// src/utils/defaultPermissions.js
// Default permission definitions for the RBAC system
// Structure: { module: { view: bool, add: bool, update: bool, delete: bool } }

/**
 * PERMISSION ACTIONS:
 * - view: Can read/see data
 * - add: Can create new records
 * - update: Can modify existing records
 * - delete: Can remove records
 * 
 * ROLE TYPES:
 * - superadmin: Full system access
 * - developer: View/Add/Update, NO delete (for support)
 * - admin: Full org access
 * - user: Base role with custom role permissions
 */

// ============================================
// ALL MODULES LIST
// ============================================
const ALL_MODULES = [
    'dashboard',
    'liveTracking',
    'products',
    'orderLists',
    'employees',
    'attendance',
    'leaves',
    'parties',
    'prospects',
    'sites',
    'rawMaterials',
    'analytics',
    'beatPlan',
    'tourPlan',
    'collections',
    'expenses',
    'odometer',
    'notes',
    'miscellaneousWork',
    'settings',
    // System-level modules
    'organizations',
    'systemUsers',
    'subscriptions'
];

// ============================================
// HELPER: Create full access (all 4 permissions)
// ============================================
const createFullAccess = () => {
    const permissions = {};
    ALL_MODULES.forEach(module => {
        permissions[module] = { view: true, add: true, update: true, delete: true };
    });
    return permissions;
};

// ============================================
// HELPER: Create view/add/update only (no delete)
// ============================================
const createNoDeleteAccess = () => {
    const permissions = {};
    ALL_MODULES.forEach(module => {
        permissions[module] = { view: true, add: true, update: true, delete: false };
    });
    return permissions;
};

// ============================================
// SUPERADMIN - Full system access
// ============================================
const SUPERADMIN_DEFAULT_PERMISSIONS = createFullAccess();

// ============================================
// DEVELOPER - View/Add/Update, NO delete
// ============================================
const DEVELOPER_DEFAULT_PERMISSIONS = createNoDeleteAccess();

// ============================================
// ADMIN - Full organization access
// ============================================
const ADMIN_DEFAULT_PERMISSIONS = {
    dashboard: { view: true, add: true, update: true, delete: true },
    liveTracking: { view: true, add: true, update: true, delete: true },
    products: { view: true, add: true, update: true, delete: true },
    orderLists: { view: true, add: true, update: true, delete: true },
    employees: { view: true, add: true, update: true, delete: true },
    attendance: { view: true, add: true, update: true, delete: true },
    leaves: { view: true, add: true, update: true, delete: true },
    parties: { view: true, add: true, update: true, delete: true },
    prospects: { view: true, add: true, update: true, delete: true },
    sites: { view: true, add: true, update: true, delete: true },
    rawMaterials: { view: true, add: true, update: true, delete: true },
    analytics: { view: true, add: true, update: true, delete: true },
    beatPlan: { view: true, add: true, update: true, delete: true },
    tourPlan: { view: true, add: true, update: true, delete: true },
    collections: { view: true, add: true, update: true, delete: true },
    expenses: { view: true, add: true, update: true, delete: true },
    odometer: { view: true, add: true, update: true, delete: true },
    notes: { view: true, add: true, update: true, delete: true },
    miscellaneousWork: { view: true, add: true, update: true, delete: true },
    settings: { view: true, add: true, update: true, delete: true },
    // System modules - limited
    organizations: { view: true, add: false, update: true, delete: false },
    systemUsers: { view: false, add: false, update: false, delete: false },
    subscriptions: { view: true, add: false, update: false, delete: false }
};

// ============================================
// USER - Base role (minimal permissions)
// Custom roles will override these
// ============================================
const USER_DEFAULT_PERMISSIONS = {
    dashboard: { view: true, add: false, update: false, delete: false },
    liveTracking: { view: false, add: false, update: false, delete: false },
    products: { view: true, add: false, update: false, delete: false },
    orderLists: { view: true, add: false, update: false, delete: false },
    employees: { view: false, add: false, update: false, delete: false },
    attendance: { view: true, add: false, update: false, delete: false },
    leaves: { view: true, add: true, update: false, delete: false },
    parties: { view: true, add: false, update: false, delete: false },
    prospects: { view: true, add: false, update: false, delete: false },
    sites: { view: true, add: false, update: false, delete: false },
    rawMaterials: { view: true, add: false, update: false, delete: false },
    analytics: { view: false, add: false, update: false, delete: false },
    beatPlan: { view: true, add: false, update: false, delete: false },
    tourPlan: { view: true, add: false, update: false, delete: false },
    collections: { view: true, add: false, update: false, delete: false },
    expenses: { view: true, add: true, update: false, delete: false },
    odometer: { view: true, add: false, update: false, delete: false },
    notes: { view: true, add: true, update: false, delete: false },
    miscellaneousWork: { view: true, add: false, update: false, delete: false },
    settings: { view: false, add: false, update: false, delete: false },
    mobileApp: { view: false, add: false, update: false, delete: false }, // Mobile disabled by default
    // No system module access
    organizations: { view: false, add: false, update: false, delete: false },
    systemUsers: { view: false, add: false, update: false, delete: false },
    subscriptions: { view: false, add: false, update: false, delete: false }
};

// ============================================
// ROLE CLASSIFICATION
// ============================================
const SYSTEM_ROLES = ['superadmin', 'developer'];
const ORGANIZATION_ROLES = ['admin', 'user'];

// ============================================
// ROLE TO PERMISSIONS MAPPING
// ============================================
const ROLE_PERMISSIONS = {
    superadmin: SUPERADMIN_DEFAULT_PERMISSIONS,
    developer: DEVELOPER_DEFAULT_PERMISSIONS,
    admin: ADMIN_DEFAULT_PERMISSIONS,
    user: USER_DEFAULT_PERMISSIONS
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const isSystemRole = (role) => SYSTEM_ROLES.includes(role);
const isOrganizationRole = (role) => ORGANIZATION_ROLES.includes(role);
const getDefaultPermissions = (role) => ROLE_PERMISSIONS[role] || USER_DEFAULT_PERMISSIONS;

/**
 * Check if permissions object has specific permission
 * @param {Object} permissions - Permissions object
 * @param {string} module - Module name
 * @param {string} action - Action: 'view', 'add', 'update', 'delete'
 */
const hasPermission = (permissions, module, action) => {
    if (!permissions) return false;
    if (!permissions[module]) return false;
    return permissions[module][action] === true;
};

/**
 * Check permission by role
 */
const hasPermissionByRole = (role, module, action) => {
    const permissions = ROLE_PERMISSIONS[role];
    return hasPermission(permissions, module, action);
};

const getAllModules = () => ALL_MODULES;

/**
 * Merge custom permissions with defaults
 */
const mergePermissions = (role, customPermissions = {}) => {
    const defaults = getDefaultPermissions(role);
    const merged = JSON.parse(JSON.stringify(defaults));

    for (const module in customPermissions) {
        if (merged[module]) {
            merged[module] = { ...merged[module], ...customPermissions[module] };
        } else {
            merged[module] = customPermissions[module];
        }
    }
    return merged;
};

/**
 * Create empty permissions (all false)
 */
const createEmptyPermissions = () => {
    const permissions = {};
    ALL_MODULES.forEach(module => {
        permissions[module] = { view: false, add: false, update: false, delete: false };
    });
    return permissions;
};

module.exports = {
    SUPERADMIN_DEFAULT_PERMISSIONS,
    DEVELOPER_DEFAULT_PERMISSIONS,
    ADMIN_DEFAULT_PERMISSIONS,
    USER_DEFAULT_PERMISSIONS,
    ROLE_PERMISSIONS,
    SYSTEM_ROLES,
    ORGANIZATION_ROLES,
    ALL_MODULES,
    isSystemRole,
    isOrganizationRole,
    getDefaultPermissions,
    hasPermission,
    hasPermissionByRole,
    getAllModules,
    mergePermissions,
    createEmptyPermissions,
    createFullAccess,
    createNoDeleteAccess
};
