// src/api/roles/role.model.js
// Dynamic Role model for organization-level custom roles

const mongoose = require('mongoose');
const { ALL_MODULES, createEmptyPermissions } = require('../../utils/defaultPermissions');

/**
 * Permission Schema - defines read/write/delete for each module
 */
const permissionSchema = new mongoose.Schema({
    read: { type: Boolean, default: false },
    write: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
}, { _id: false });

/**
 * Role Schema - Dynamic roles created by organization admins
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
    // Permissions object - one entry per module
    permissions: {
        dashboard: permissionSchema,
        liveTracking: permissionSchema,
        products: permissionSchema,
        orderLists: permissionSchema,
        employees: permissionSchema,
        attendance: permissionSchema,
        leaves: permissionSchema,
        parties: permissionSchema,
        prospects: permissionSchema,
        sites: permissionSchema,
        rawMaterials: permissionSchema,
        analytics: permissionSchema,
        beatPlan: permissionSchema,
        tourPlan: permissionSchema,
        collections: permissionSchema,
        expenses: permissionSchema,
        odometer: permissionSchema,
        notes: permissionSchema,
        miscellaneousWork: permissionSchema,
        settings: permissionSchema
    },
    // Is this role active?
    isActive: {
        type: Boolean,
        default: true
    },
    // Is this a default/system role that can't be deleted?
    isDefault: {
        type: Boolean,
        default: false
    },
    // Who created this role
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Compound index to ensure unique role names within an organization
roleSchema.index({ name: 1, organizationId: 1 }, { unique: true });

// Index for fast lookups
roleSchema.index({ organizationId: 1, isActive: 1 });

/**
 * Pre-save middleware to initialize permissions if not set
 */
roleSchema.pre('save', function (next) {
    if (this.isNew && !this.permissions) {
        // Initialize with empty permissions
        this.permissions = createEmptyPermissions();
    }
    next();
});

/**
 * Check if role has specific permission
 * @param {string} module - Module name
 * @param {string} action - Action type ('read', 'write', 'delete')
 * @returns {boolean}
 */
roleSchema.methods.hasPermission = function (module, action) {
    if (!this.permissions || !this.permissions[module]) return false;
    return this.permissions[module][action] === true;
};

/**
 * Get all permissions as a flat object
 * @returns {Object}
 */
roleSchema.methods.getPermissions = function () {
    const perms = {};
    for (const module of ALL_MODULES) {
        if (this.permissions && this.permissions[module]) {
            perms[module] = {
                read: this.permissions[module].read || false,
                write: this.permissions[module].write || false,
                delete: this.permissions[module].delete || false
            };
        } else {
            perms[module] = { read: false, write: false, delete: false };
        }
    }
    return perms;
};

/**
 * Static method to get available modules for frontend
 */
roleSchema.statics.getAvailableModules = function () {
    return ALL_MODULES.filter(m => !['organizations', 'systemUsers', 'subscriptions'].includes(m));
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
