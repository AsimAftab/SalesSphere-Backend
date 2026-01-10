const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
    partyName: {
        type: String,
        required: [true, 'Party name is required'],
        trim: true,
    },
    ownerName: {
        type: String,
        required: [true, 'Owner name is required'],
        trim: true,
    },
    dateJoined: {
        type: Date,
        required: [true, 'Date joined is required'],
    },
    panVatNumber: {
        type: String,
        required: [true, 'PAN/VAT number is required'],
        trim: true,
        maxlength: 14
    },
    partyType: {
        type: String,
        trim: true,
    },
    contact: {
        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            trim: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
    },
    location: {
        address: {
            type: String,
            trim: true,
        },
        latitude: {
            type: Number,
        },
        longitude: {
            type: Number,
        },
    },
    description: {
        type: String,
        trim: true,
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    image: {
        type: String,
        default: null,
    },
    // --- REMOVED isActive ---
    // isActive: {
    //   type: Boolean,
    //   default: true,
    // },
    // --- END REMOVAL ---

    // ============================================
    // ASSIGNMENT FIELDS
    // ============================================
    // Users assigned to this party (for data access control)
    assignedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Who made the assignment
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // When assignment was last updated
    assignedAt: {
        type: Date,
        default: null
    },
}, { timestamps: true });

// --- RE-ADDED UNIQUE INDEX ---
// Index to ensure panVatNumber is unique within an organization
partySchema.index({ panVatNumber: 1, organizationId: 1 }, { unique: true });
// --- END RE-ADDITION ---

// ============================================
// ASSIGNMENT INDEXES
// ============================================
// Index for efficient queries to find parties assigned to a user
partySchema.index({ organizationId: 1, assignedUsers: 1 });
// Index for queries combining createdBy and assignment
partySchema.index({ organizationId: 1, createdBy: 1, assignedUsers: 1 });
// Index for partyType queries and sync operations
partySchema.index({ organizationId: 1, partyType: 1 });

const Party = mongoose.model('Party', partySchema);

module.exports = Party;

