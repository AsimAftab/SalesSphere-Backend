const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
        select: false, // Don't send password in query results
    },
    role: {
        type: String,
        enum: ['superadmin', 'admin', 'manager', 'developer', 'salesperson', 'user'],
        default: 'user',
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        // Organization is required for everyone except the superadmin
        required: [
            function() { return this.role !== 'superadmin'; },
            'Organization ID is required for non-superadmin users'
        ]
    },
    isActive: {
        type: Boolean,
        default: true,
    },

    // --- New Employee Detail Fields ---
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
    age: {
        type: Number,
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
    ]
    // --- End of New Fields ---

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

const User = mongoose.model('User', userSchema);

module.exports = User;
