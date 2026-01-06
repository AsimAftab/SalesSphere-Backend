// src/api/roles/role.model.js
// Dynamic Role model for organization-level custom roles
// Granular feature-based permissions only

const mongoose = require('mongoose');
const { ALL_MODULES } = require('../../utils/defaultPermissions');
const { FEATURE_REGISTRY } = require('../../config/featureRegistry');

/**
 * Create a granular permission schema for a specific module
 * Each module has its own set of feature keys defined in FEATURE_REGISTRY
 */
function createGranularPermissionSchema(moduleName) {
    const features = FEATURE_REGISTRY[moduleName] || {};
    const schemaDef = {};

    // Create a boolean field for each feature key
    for (const featureKey of Object.keys(features)) {
        schemaDef[featureKey] = { type: Boolean, default: false };
    }

    return new mongoose.Schema(schemaDef, { _id: false });
}

// Pre-build schemas for each module
const GRANULAR_SCHEMAS = {};
for (const moduleName of Object.keys(FEATURE_REGISTRY)) {
    GRANULAR_SCHEMAS[moduleName] = createGranularPermissionSchema(moduleName);
}

/**
 * Helper: Create empty permissions for all modules
 */
function createEmptyPermissions() {
    const permissions = {};
    for (const moduleName of Object.keys(FEATURE_REGISTRY)) {
        permissions[moduleName] = {};
        const features = FEATURE_REGISTRY[moduleName] || {};
        for (const featureKey of Object.keys(features)) {
            permissions[moduleName][featureKey] = false;
        }
    }
    return permissions;
}

/**
 * Role Schema - Dynamic roles created by organization admins
 * Permissions use granular feature keys from FEATURE_REGISTRY
 */
const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Role name is required'],
        trim: true,
        maxlength: [50, 'Role name cannot exceed 50 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [200, 'Description cannot exceed 200 characters']
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required']
    },
    // Granular permissions using feature keys from FEATURE_REGISTRY
    // Each module has its own set of feature-specific boolean flags
    permissions: {
        // Attendance Module
        attendance: GRANULAR_SCHEMAS.attendance,

        // Products Module
        products: GRANULAR_SCHEMAS.products,

        // Prospects Module
        prospects: GRANULAR_SCHEMAS.prospects,

        // Order Lists / Invoices Module
        orderLists: GRANULAR_SCHEMAS.orderLists,

        // Collections Module
        collections: GRANULAR_SCHEMAS.collections,

        // Beat Plans Module
        beatPlan: GRANULAR_SCHEMAS.beatPlan,

        // Tour Plans Module
        tourPlan: GRANULAR_SCHEMAS.tourPlan,

        // Live Tracking Module
        liveTracking: GRANULAR_SCHEMAS.liveTracking,

        // Expenses Module
        expenses: GRANULAR_SCHEMAS.expenses,

        // Leaves Module
        leaves: GRANULAR_SCHEMAS.leaves,

        // Parties Module
        parties: GRANULAR_SCHEMAS.parties,

        // Sites Module
        sites: GRANULAR_SCHEMAS.sites,

        // Dashboard Module
        dashboard: GRANULAR_SCHEMAS.dashboard,

        // Analytics Module
        analytics: GRANULAR_SCHEMAS.analytics,

        // Notes Module
        notes: GRANULAR_SCHEMAS.notes,

        // Miscellaneous Work Module
        miscellaneousWork: GRANULAR_SCHEMAS.miscellaneousWork,

        // Settings Module
        settings: GRANULAR_SCHEMAS.settings,

        // Employees Module
        employees: GRANULAR_SCHEMAS.employees,

        // Odometer Module
        odometer: GRANULAR_SCHEMAS.odometer
    },
    mobileAppAccess: {
        type: Boolean,
        default: false,
        required: true
    },
    webPortalAccess: {
        type: Boolean,
        default: false,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Unique role names per organization
roleSchema.index({ name: 1, organizationId: 1 }, { unique: true });
roleSchema.index({ organizationId: 1, isActive: 1 });

roleSchema.pre('save', function (next) {
    if (this.isNew && !this.permissions) {
        this.permissions = createEmptyPermissions();
    }
    next();
});

/**
 * Check if role has a specific granular feature permission
 * @param {string} moduleName - Module name (e.g., 'attendance', 'products')
 * @param {string} featureKey - Feature key (e.g., 'webCheckIn', 'exportPdf')
 * @returns {boolean}
 */
roleSchema.methods.hasFeature = function (moduleName, featureKey) {
    if (!this.permissions || !this.permissions[moduleName]) return false;
    return this.permissions[moduleName][featureKey] === true;
};

/**
 * Get all permissions for this role
 * Returns granular feature permissions for each module
 * @returns {Object} Permissions object with module: { features } structure
 */
roleSchema.methods.getPermissions = function () {
    const perms = {};

    for (const moduleName of Object.keys(FEATURE_REGISTRY)) {
        if (this.permissions && this.permissions[moduleName]) {
            perms[moduleName] = {};
            // Copy all feature flags for this module
            const features = FEATURE_REGISTRY[moduleName] || {};
            for (const featureKey of Object.keys(features)) {
                perms[moduleName][featureKey] = this.permissions[moduleName][featureKey] || false;
            }
        } else {
            perms[moduleName] = {};
            const features = FEATURE_REGISTRY[moduleName] || {};
            for (const featureKey of Object.keys(features)) {
                perms[moduleName][featureKey] = false;
            }
        }
    }
    return perms;
};

/**
 * Get enabled features for a specific module
 * @param {string} moduleName - Module name
 * @returns {string[]} Array of enabled feature keys
 */
roleSchema.methods.getEnabledFeatures = function (moduleName) {
    if (!this.permissions || !this.permissions[moduleName]) return [];

    const features = FEATURE_REGISTRY[moduleName] || {};
    const enabledFeatures = [];

    for (const featureKey of Object.keys(features)) {
        if (this.permissions[moduleName][featureKey] === true) {
            enabledFeatures.push(featureKey);
        }
    }

    return enabledFeatures;
};

/**
 * Set a specific feature permission
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key
 * @param {boolean} enabled - Enable or disable
 */
roleSchema.methods.setFeature = function (moduleName, featureKey, enabled) {
    if (!this.permissions) {
        this.permissions = {};
    }
    if (!this.permissions[moduleName]) {
        this.permissions[moduleName] = {};
    }
    this.permissions[moduleName][featureKey] = Boolean(enabled);
};

/**
 * Set all features for a module at once
 * @param {string} moduleName - Module name
 * @param {Object} features - Object with featureKey: boolean pairs
 */
roleSchema.methods.setModuleFeatures = function (moduleName, features) {
    if (!this.permissions) {
        this.permissions = {};
    }
    if (!this.permissions[moduleName]) {
        this.permissions[moduleName] = {};
    }
    for (const [key, value] of Object.entries(features)) {
        this.permissions[moduleName][key] = Boolean(value);
    }
};

roleSchema.statics.getAvailableModules = function () {
    return Object.keys(FEATURE_REGISTRY);
};

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
