// src/utils/defaultPermissions.js
// Default permission definitions for the RBAC system
// Structure: { module: { read: bool, write: bool, delete: bool } }

/**
 * ROLE TYPES:
 * 
 * SYSTEM ROLES (cross-organization):
 * - superadmin: Full access to everything
 * - developer: Read/Write access, NO delete (for support/debugging)
 * 
 * ORGANIZATION ROLES:
 * - admin: Organization administrator - Full permissions within their org
 * - manager: Team manager - Configurable permissions (future: dynamic)
 * - salesperson: Field representative - Limited permissions
 * - user: Basic user - Minimal permissions
 * 
 * FUTURE ENHANCEMENTS:
 * - Plan-based role features
 * - Dynamic role creation by org admins
 */

// ============================================
// ALL MODULES LIST (for reference)
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
    // System-level modules (superadmin/developer only)
    'organizations',
    'systemUsers',
    'subscriptions'
];

// ============================================
// HELPER: Create full access permissions
// ============================================
const createFullAccess = () => {
    const permissions = {};
    ALL_MODULES.forEach(module => {
        permissions[module] = { read: true, write: true, delete: true };
    });
    return permissions;
};

// ============================================
// HELPER: Create read/write only (no delete)
// ============================================
const createReadWriteOnly = () => {
    const permissions = {};
    ALL_MODULES.forEach(module => {
        permissions[module] = { read: true, write: true, delete: false };
    });
    return permissions;
};

// ============================================
// SUPERADMIN - Full system access (all modules, all actions)
// ============================================
const SUPERADMIN_DEFAULT_PERMISSIONS = createFullAccess();

// ============================================
// DEVELOPER - Read/Write access, NO delete (for support)
// ============================================
const DEVELOPER_DEFAULT_PERMISSIONS = createReadWriteOnly();

// ============================================
// ADMIN - Organization administrator (full access within org)
// Note: System modules access controlled separately in middleware
// ============================================
const ADMIN_DEFAULT_PERMISSIONS = {
    dashboard: { read: true, write: true, delete: true },
    liveTracking: { read: true, write: true, delete: true },
    products: { read: true, write: true, delete: true },
    orderLists: { read: true, write: true, delete: true },
    employees: { read: true, write: true, delete: true },
    attendance: { read: true, write: true, delete: true },
    leaves: { read: true, write: true, delete: true },
    parties: { read: true, write: true, delete: true },
    prospects: { read: true, write: true, delete: true },
    sites: { read: true, write: true, delete: true },
    rawMaterials: { read: true, write: true, delete: true },
    analytics: { read: true, write: true, delete: true },
    beatPlan: { read: true, write: true, delete: true },
    tourPlan: { read: true, write: true, delete: true },
    collections: { read: true, write: true, delete: true },
    expenses: { read: true, write: true, delete: true },
    odometer: { read: true, write: true, delete: true },
    notes: { read: true, write: true, delete: true },
    miscellaneousWork: { read: true, write: true, delete: true },
    settings: { read: true, write: true, delete: true },
    // System modules - admin can only read their own org
    organizations: { read: true, write: true, delete: false },
    systemUsers: { read: false, write: false, delete: false },
    subscriptions: { read: true, write: false, delete: false }
};

// ============================================
// MANAGER - Team manager (configurable in future)
// ============================================
const MANAGER_DEFAULT_PERMISSIONS = {
    dashboard: { read: true, write: false, delete: false },
    liveTracking: { read: true, write: false, delete: false },
    products: { read: true, write: true, delete: false },
    orderLists: { read: true, write: true, delete: false },
    employees: { read: true, write: true, delete: false },
    attendance: { read: true, write: true, delete: false },
    leaves: { read: true, write: true, delete: false },
    parties: { read: true, write: true, delete: false },
    prospects: { read: true, write: true, delete: false },
    sites: { read: true, write: true, delete: false },
    rawMaterials: { read: true, write: true, delete: false },
    analytics: { read: true, write: false, delete: false },
    beatPlan: { read: true, write: true, delete: false },
    tourPlan: { read: true, write: true, delete: false },
    collections: { read: true, write: true, delete: false },
    expenses: { read: true, write: true, delete: false },
    odometer: { read: true, write: false, delete: false },
    notes: { read: true, write: true, delete: false },
    miscellaneousWork: { read: true, write: true, delete: false },
    settings: { read: true, write: false, delete: false },
    // No system module access
    organizations: { read: true, write: false, delete: false },
    systemUsers: { read: false, write: false, delete: false },
    subscriptions: { read: false, write: false, delete: false }
};

// ============================================
// SALESPERSON - Field representative
// Note: Resource-level filtering handled in controllers
// ============================================
const SALESPERSON_DEFAULT_PERMISSIONS = {
    dashboard: { read: true, write: false, delete: false },
    liveTracking: { read: false, write: false, delete: false },
    products: { read: true, write: false, delete: false },
    orderLists: { read: true, write: true, delete: false }, // Can create orders
    employees: { read: false, write: false, delete: false },
    attendance: { read: true, write: true, delete: false }, // Own attendance
    leaves: { read: true, write: true, delete: false }, // Own leaves
    parties: { read: true, write: true, delete: false },
    prospects: { read: true, write: true, delete: false },
    sites: { read: true, write: true, delete: false },
    rawMaterials: { read: true, write: false, delete: false },
    analytics: { read: false, write: false, delete: false },
    beatPlan: { read: true, write: false, delete: false }, // View assigned
    tourPlan: { read: true, write: false, delete: false },
    collections: { read: true, write: true, delete: false },
    expenses: { read: true, write: true, delete: false },
    odometer: { read: true, write: true, delete: false },
    notes: { read: true, write: true, delete: false },
    miscellaneousWork: { read: true, write: true, delete: false },
    settings: { read: false, write: false, delete: false },
    // No system module access
    organizations: { read: false, write: false, delete: false },
    systemUsers: { read: false, write: false, delete: false },
    subscriptions: { read: false, write: false, delete: false }
};

// ============================================
// USER - Basic/default user
// ============================================
const USER_DEFAULT_PERMISSIONS = {
    dashboard: { read: true, write: false, delete: false },
    liveTracking: { read: false, write: false, delete: false },
    products: { read: true, write: false, delete: false },
    orderLists: { read: true, write: false, delete: false },
    employees: { read: false, write: false, delete: false },
    attendance: { read: true, write: false, delete: false },
    leaves: { read: true, write: true, delete: false }, // Can request
    parties: { read: true, write: false, delete: false },
    prospects: { read: true, write: false, delete: false },
    sites: { read: true, write: false, delete: false },
    rawMaterials: { read: true, write: false, delete: false },
    analytics: { read: false, write: false, delete: false },
    beatPlan: { read: true, write: false, delete: false },
    tourPlan: { read: true, write: false, delete: false },
    collections: { read: true, write: false, delete: false },
    expenses: { read: true, write: true, delete: false }, // Can submit
    odometer: { read: true, write: false, delete: false },
    notes: { read: true, write: true, delete: false },
    miscellaneousWork: { read: true, write: false, delete: false },
    settings: { read: false, write: false, delete: false },
    // No system module access
    organizations: { read: false, write: false, delete: false },
    systemUsers: { read: false, write: false, delete: false },
    subscriptions: { read: false, write: false, delete: false }
};

// ============================================
// ROLE CLASSIFICATION
// ============================================
const SYSTEM_ROLES = ['superadmin', 'developer'];
const ORGANIZATION_ROLES = ['admin', 'manager', 'salesperson', 'user'];

// ============================================
// ROLE TO PERMISSIONS MAPPING
// ============================================
const ROLE_PERMISSIONS = {
    superadmin: SUPERADMIN_DEFAULT_PERMISSIONS,
    developer: DEVELOPER_DEFAULT_PERMISSIONS,
    admin: ADMIN_DEFAULT_PERMISSIONS,
    manager: MANAGER_DEFAULT_PERMISSIONS,
    salesperson: SALESPERSON_DEFAULT_PERMISSIONS,
    user: USER_DEFAULT_PERMISSIONS
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if role is a system role
 * @param {string} role 
 * @returns {boolean}
 */
const isSystemRole = (role) => SYSTEM_ROLES.includes(role);

/**
 * Check if role is an organization role
 * @param {string} role 
 * @returns {boolean}
 */
const isOrganizationRole = (role) => ORGANIZATION_ROLES.includes(role);

/**
 * Get default permissions for a role
 * @param {string} role - Role name
 * @returns {Object} Permission object for the role
 */
const getDefaultPermissions = (role) => {
    return ROLE_PERMISSIONS[role] || USER_DEFAULT_PERMISSIONS;
};

/**
 * Check if a role has specific permission
 * @param {Object} permissions - User's permissions object
 * @param {string} module - Module name (e.g., 'products', 'parties')
 * @param {string} action - Action type ('read', 'write', 'delete')
 * @returns {boolean}
 */
const hasPermission = (permissions, module, action) => {
    if (!permissions) return false;
    if (!permissions[module]) return false;
    return permissions[module][action] === true;
};

/**
 * Check permission by role (uses default permissions)
 * @param {string} role - Role name
 * @param {string} module - Module name
 * @param {string} action - Action type
 * @returns {boolean}
 */
const hasPermissionByRole = (role, module, action) => {
    const permissions = ROLE_PERMISSIONS[role];
    return hasPermission(permissions, module, action);
};

/**
 * Get all module names
 * @returns {string[]}
 */
const getAllModules = () => ALL_MODULES;

/**
 * Merge custom permissions with default permissions
 * Custom permissions override defaults
 * @param {string} role - Base role
 * @param {Object} customPermissions - Custom permission overrides
 * @returns {Object} Merged permissions
 */
const mergePermissions = (role, customPermissions = {}) => {
    const defaults = getDefaultPermissions(role);
    const merged = JSON.parse(JSON.stringify(defaults)); // Deep clone

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
 * Create empty permissions object (all false)
 * @returns {Object}
 */
const createEmptyPermissions = () => {
    const permissions = {};
    ALL_MODULES.forEach(module => {
        permissions[module] = { read: false, write: false, delete: false };
    });
    return permissions;
};

module.exports = {
    // Permission constants
    SUPERADMIN_DEFAULT_PERMISSIONS,
    DEVELOPER_DEFAULT_PERMISSIONS,
    ADMIN_DEFAULT_PERMISSIONS,
    MANAGER_DEFAULT_PERMISSIONS,
    SALESPERSON_DEFAULT_PERMISSIONS,
    USER_DEFAULT_PERMISSIONS,
    ROLE_PERMISSIONS,

    // Role classifications
    SYSTEM_ROLES,
    ORGANIZATION_ROLES,
    ALL_MODULES,

    // Helper functions
    isSystemRole,
    isOrganizationRole,
    getDefaultPermissions,
    hasPermission,
    hasPermissionByRole,
    getAllModules,
    mergePermissions,
    createEmptyPermissions,
    createFullAccess,
    createReadWriteOnly
};
