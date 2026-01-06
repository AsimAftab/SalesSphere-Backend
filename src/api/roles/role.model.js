// src/api/roles/role.model.js
// Dynamic Role model for organization-level custom roles
// Uses flexible Map schema for granular feature-based permissions

const mongoose = require('mongoose');
const { FEATURE_REGISTRY } = require('../../config/featureRegistry');

/**
 * Helper: Create empty permissions object for all modules
 * Used when creating a new role
 */
function createEmptyPermissions() {
    const permissions = new Map();
    for (const moduleName of Object.keys(FEATURE_REGISTRY)) {
        const moduleFeatures = new Map();
        const features = FEATURE_REGISTRY[moduleName] || {};
        for (const featureKey of Object.keys(features)) {
            moduleFeatures.set(featureKey, false);
        }
        permissions.set(moduleName, moduleFeatures);
    }
    return permissions;
}

/**
 * Role Schema - Dynamic roles created by organization admins
 * 
 * Permissions use a flexible Map structure:
 * - Outer Map: moduleName -> modulePermissions
 * - Inner Map: featureKey -> boolean
 * 
 * This allows adding new modules/features to FEATURE_REGISTRY
 * without requiring schema migrations.
 * 
 * Example data in MongoDB:
 * {
 *   "name": "Sales Manager",
 *   "permissions": {
 *     "attendance": { "webCheckIn": true, "markHoliday": true },
 *     "products": { "create": true, "delete": false }
 *   }
 * }
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
    // Flexible Map-based permissions
    // Map<moduleName, Map<featureKey, boolean>>
    permissions: {
        type: Map,
        of: {
            type: Map,
            of: Boolean
        },
        default: () => new Map()
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
    if (this.isNew && (!this.permissions || this.permissions.size === 0)) {
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
    if (!this.permissions) return false;

    const modulePerms = this.permissions.get(moduleName);
    if (!modulePerms) return false;

    return modulePerms.get(featureKey) === true;
};

/**
 * Get all permissions for this role
 * Returns granular feature permissions for each module as a plain object
 * Fills in missing keys with false based on FEATURE_REGISTRY
 * @returns {Object} Permissions object with module: { features } structure
 */
roleSchema.methods.getPermissions = function () {
    const perms = {};

    for (const moduleName of Object.keys(FEATURE_REGISTRY)) {
        perms[moduleName] = {};
        const features = FEATURE_REGISTRY[moduleName] || {};
        const modulePerms = this.permissions?.get(moduleName);

        for (const featureKey of Object.keys(features)) {
            // Use Map's get() method, default to false if undefined
            perms[moduleName][featureKey] = modulePerms?.get(featureKey) === true;
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
    const modulePerms = this.permissions?.get(moduleName);
    if (!modulePerms) return [];

    const features = FEATURE_REGISTRY[moduleName] || {};
    const enabledFeatures = [];

    for (const featureKey of Object.keys(features)) {
        if (modulePerms.get(featureKey) === true) {
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
        this.permissions = new Map();
    }

    if (!this.permissions.has(moduleName)) {
        this.permissions.set(moduleName, new Map());
    }

    this.permissions.get(moduleName).set(featureKey, Boolean(enabled));
    this.markModified('permissions');
};

/**
 * Set all features for a module at once
 * @param {string} moduleName - Module name
 * @param {Object} features - Object with featureKey: boolean pairs
 */
roleSchema.methods.setModuleFeatures = function (moduleName, features) {
    if (!this.permissions) {
        this.permissions = new Map();
    }

    if (!this.permissions.has(moduleName)) {
        this.permissions.set(moduleName, new Map());
    }

    const modulePerms = this.permissions.get(moduleName);
    for (const [key, value] of Object.entries(features)) {
        modulePerms.set(key, Boolean(value));
    }

    this.markModified('permissions');
};

/**
 * Set permissions from a plain object (useful for API updates)
 * @param {Object} permissionsObj - Object with module: { features } structure
 */
roleSchema.methods.setPermissionsFromObject = function (permissionsObj) {
    if (!this.permissions) {
        this.permissions = new Map();
    }

    for (const [moduleName, moduleFeatures] of Object.entries(permissionsObj)) {
        if (!this.permissions.has(moduleName)) {
            this.permissions.set(moduleName, new Map());
        }

        const modulePerms = this.permissions.get(moduleName);
        for (const [featureKey, value] of Object.entries(moduleFeatures)) {
            modulePerms.set(featureKey, Boolean(value));
        }
    }

    this.markModified('permissions');
};

roleSchema.statics.getAvailableModules = function () {
    return Object.keys(FEATURE_REGISTRY);
};

/**
 * Static: Get all feature keys for a module
 * @param {string} moduleName - Module name
 * @returns {string[]} Array of feature keys
 */
roleSchema.statics.getModuleFeatures = function (moduleName) {
    return Object.keys(FEATURE_REGISTRY[moduleName] || {});
};

// Ensure permissions are serialized as a plain object with defaults filled in
roleSchema.set('toJSON', {
    transform: function (doc, ret) {
        if (doc.getPermissions) {
            ret.permissions = doc.getPermissions();
        }
        return ret;
    }
});

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
