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
        // Return permissions from the custom role
        const rolePerms = {};
        const customRole = this.customRoleId;

        // Convert mongoose subdocuments to plain object
        if (customRole.permissions) {
            for (const [module, perms] of Object.entries(customRole.permissions.toObject ? customRole.permissions.toObject() : customRole.permissions)) {
                rolePerms[module] = {
                    read: perms.read || false,
                    write: perms.write || false,
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
 * @param {string} action - Action type ('read', 'write', 'delete')
 * @returns {boolean}
 */
userSchema.methods.hasPermission = function (module, action) {
    const permissions = this.getEffectivePermissions();
    if (!permissions[module]) return false;
    return permissions[module][action] === true;
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