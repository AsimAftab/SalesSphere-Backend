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
// --- Optional: Add a virtual property to calculate age ---
userSchema.virtual('age').get(function() {
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
