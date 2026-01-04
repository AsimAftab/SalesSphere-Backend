// src/api/roles/role.model.js
// Dynamic Role model for organization-level custom roles

const mongoose = require('mongoose');
const { ALL_MODULES, createEmptyPermissions } = require('../../utils/defaultPermissions');

/**
 * Permission Schema - view/add/update/delete for each module
 */
const permissionSchema = new mongoose.Schema({
    view: { type: Boolean, default: false },
    add: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
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
 * Check permission - actions: 'view', 'add', 'update', 'delete'
 */
roleSchema.methods.hasPermission = function (module, action) {
    if (!this.permissions || !this.permissions[module]) return false;
    return this.permissions[module][action] === true;
};

roleSchema.methods.getPermissions = function () {
    const perms = {};
    for (const module of ALL_MODULES) {
        if (this.permissions && this.permissions[module]) {
            perms[module] = {
                view: this.permissions[module].view || false,
                add: this.permissions[module].add || false,
                update: this.permissions[module].update || false,
                delete: this.permissions[module].delete || false
            };
        } else {
            perms[module] = { view: false, add: false, update: false, delete: false };
        }
    }
    return perms;
};

roleSchema.statics.getAvailableModules = function () {
    return ALL_MODULES.filter(m => !['organizations', 'systemUsers', 'subscriptions'].includes(m));
};

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
