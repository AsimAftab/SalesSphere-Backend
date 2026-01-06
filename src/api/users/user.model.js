const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDefaultPermissions, isSystemRole, ADMIN_DEFAULT_PERMISSIONS } = require('../../utils/defaultPermissions');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide your name'],
    },
    email: {
        type: String,
        required: [true, 'Please provide your email'],
        unique: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false,
    },
    // Base role - system roles (superadmin, developer) or admin for org owners
    role: {
        type: String,
        enum: ['superadmin', 'developer', 'admin', 'user'],
        default: 'user',
    },
    // Dynamic role reference - for non-admin org users
    // When set, permissions come from this role instead of base role defaults
    customRoleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role',
        default: null
    },
    // Direct supervisor (User ID)
    reportsTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [
            function () {
                return !isSystemRole(this.role);
            },
            'Organization ID is required for non-system users'
        ]
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    // Mobile app access override (null/undefined = inherit from role)
    mobileAppAccess: {
        type: Boolean,
        default: undefined
    },
    // Web portal access override (null/undefined = inherit from role)
    webPortalAccess: {
        type: Boolean,
        default: undefined
    },


    // --- Employee Detail Fields ---
    avatarUrl: {
        type: String,
    },
    phone: {
        type: String,
        trim: true,
    },
    address: {
        type: String,
        trim: true,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
    },
    dateOfBirth: {
        type: Date,
    },
    panNumber: {
        type: String,
        trim: true,
    },
    citizenshipNumber: {
        type: String,
        trim: true,
    },
    dateJoined: {
        type: Date,
        default: Date.now,
    },
    documents: [
        {
            fileName: String,
            fileUrl: String,
            uploadedAt: { type: Date, default: Date.now }
        }
    ],
    // --- End of Employee Fields ---

    // --- 2. ADDED: Fields for Password Reset ---
    passwordResetToken: String,
    passwordResetExpires: Date,
    // ----------------------------------------

    // --- 3. ADDED: Fields for Refresh Token ---
    refreshToken: {
        type: String,
        select: false, // Don't send refresh token in query results
    },
    refreshTokenExpiry: {
        type: Date,
        select: false,
    },
    // Absolute session timeout - user must re-login after this date (regardless of refresh)
    sessionExpiresAt: {
        type: Date,
        select: false,
    },
    // ----------------------------------------

}, { timestamps: true });


// Middleware to hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    // Combine salt generation and hashing into one step
    this.password = await bcrypt.hash(this.password, 12);

    next();
});

// Method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// --- 3. ADDED: Method to create and hash password reset token ---
userSchema.methods.createPasswordResetToken = function () {
    // Generate the unhashed token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token and save it to the user document
    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set an expiry time (e.g., 10 minutes from now)
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    // Return the *unhashed* token (this is what you email to the user)
    return resetToken;
};
// -------------------------------------------------------------

// --- 4. RBAC Permission Methods ---
/**
 * Get effective permissions for this user
 * Priority: 
 * 1. System roles (superadmin/developer) - use defaults
 * 2. Admin - full access within org
 * 3. Custom Role (if customRoleId is set) - use role's permissions
 * 4. Default user - minimal permissions
 * @returns {Object} Complete permissions object
 */
userSchema.methods.getEffectivePermissions = function () {
    // System roles use their defaults
    if (isSystemRole(this.role)) {
        return getDefaultPermissions(this.role);
    }

    // Admin gets full org access
    if (this.role === 'admin') {
        return ADMIN_DEFAULT_PERMISSIONS;
    }

    // If user has a custom role assigned and it's populated
    if (this.customRoleId && this.customRoleId.permissions) {
        const rolePerms = {};
        const customRole = this.customRoleId;

        if (customRole.permissions) {
            for (const [module, perms] of Object.entries(customRole.permissions.toObject ? customRole.permissions.toObject() : customRole.permissions)) {
                rolePerms[module] = {
                    view: perms.view || false,
                    add: perms.add || false,
                    update: perms.update || false,
                    delete: perms.delete || false
                };
            }
        }
        return rolePerms;
    }

    // Default: user role with minimal permissions
    return getDefaultPermissions('user');
};

/**
 * Check if user has specific permission
 * @param {string} module - Module name (e.g., 'products', 'parties')
 * @param {string} action - Action type ('view', 'add', 'update', 'delete')
 * @returns {boolean}
 */
userSchema.methods.hasPermission = function (module, action) {
    const permissions = this.getEffectivePermissions();
    if (!permissions[module]) return false;
    return permissions[module][action] === true;
};

/**
 * Get effective permissions intersected with organization's subscription plan
 * Async because it needs to fetch organization and plan from DB
 * @param {Object} orgWithPlan - Organization object with subscriptionPlanId populated
 * @returns {Object} Permissions filtered by plan features
 */
userSchema.methods.getEffectivePermissionsWithPlan = function (orgWithPlan) {
    const basePermissions = this.getEffectivePermissions();

    // System roles bypass plan restrictions
    if (isSystemRole(this.role)) {
        return basePermissions;
    }

    // If no org or plan provided, return base permissions
    if (!orgWithPlan || !orgWithPlan.subscriptionPlanId) {
        return basePermissions;
    }

    const plan = orgWithPlan.subscriptionPlanId;
    const enabledModules = plan.enabledModules || [];

    // Intersect: only include modules that are both in permissions AND in plan
    const intersectedPermissions = {};

    for (const [module, perms] of Object.entries(basePermissions)) {
        // Always include system modules (settings, etc.)
        const systemModules = ['organizations', 'systemUsers', 'subscriptions', 'settings'];

        if (systemModules.includes(module) || enabledModules.includes(module)) {
            intersectedPermissions[module] = perms;
        } else {
            // Module not in plan - set all to false
            intersectedPermissions[module] = {
                view: false,
                add: false,
                update: false,
                delete: false
            };
        }
    }

    return intersectedPermissions;
};
// -----------------------------------------

/**
 * Check if user has mobile app access
 * Priority:
 * 1. User-specific override (if defined)
 * 2. System/Admin roles (Always allowed)
 * 3. Custom Role default (if assigned)
 * 4. Default User (Allowed/Blocked based on policy - currently Blocked by default)
 */
userSchema.methods.hasMobileAccess = function () {
    // 1. User specific override (takes precedence over everything)
    if (this.mobileAppAccess !== undefined && this.mobileAppAccess !== null) {
        return this.mobileAppAccess;
    }

    // 2. System roles & Admin always have access (unless explicitly overridden above)
    if (isSystemRole(this.role) || this.role === 'admin') {
        return true;
    }

    // 3. Custom Role inheritance
    if (this.customRoleId) {
        // Handle if customRoleId is populated object or just ID
        // If it's just ID, we can't check permissions, so we default to false (safe fail)
        // ideally populate('customRoleId') should be used before calling this
        if (this.customRoleId.mobileAppAccess !== undefined) {
            return this.customRoleId.mobileAppAccess;
        }
    }

    // 4. Default fallback for standard users without valid role/override
    return false;
};

/**
 * Check if user has web portal access
 * Priority:
 * 1. User-specific override
 * 2. System/Admin roles (Always allowed)
 * 3. Custom Role default
 * 4. Default User (Blocked by default)
 */
userSchema.methods.hasWebAccess = function () {
    // 1. User specific override
    if (this.webPortalAccess !== undefined && this.webPortalAccess !== null) {
        return this.webPortalAccess;
    }

    // 2. System roles & Admin always have access
    if (isSystemRole(this.role) || this.role === 'admin') {
        return true;
    }

    // 3. Custom Role inheritance
    if (this.customRoleId) {
        if (this.customRoleId.webPortalAccess !== undefined) {
            return this.customRoleId.webPortalAccess;
        }
    }

    // 4. Default fallback: NO web access for standard users
    return false;
};
// -----------------------------------------

// --- Optional: Add a virtual property to calculate age ---
userSchema.virtual('age').get(function () {
    if (!this.dateOfBirth) return undefined; // Or null, or 0

    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

userSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret) {
        // Move virtual 'age' to appear right after dateOfBirth
        if (ret.dateOfBirth && ret.age !== undefined) {
            const { age, ...rest } = ret;
            const reordered = {};
            for (const key in rest) {
                reordered[key] = rest[key];
                if (key === 'dateOfBirth') {
                    reordered.age = age; // insert after dateOfBirth
                }
            }
            return reordered;
        }
        return ret;
    }
});
// --- End Virtual ---

const User = mongoose.model('User', userSchema);

module.exports = User;