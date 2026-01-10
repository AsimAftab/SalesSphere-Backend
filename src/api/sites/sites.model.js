const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema({
    siteName: {
        type: String,
        required: [true, 'Site name is required'],
        trim: true,
    },
    ownerName: {
        type: String,
        required: [true, 'Owner name is required'],
        trim: true,
    },
    subOrganization: {
        type: String,
        trim: true,
    },
    dateJoined: {
        type: Date,
        required: [true, 'Date joined is required'],
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
            required: [true, 'Address is required'],
            trim: true,
        },
        latitude: {
            type: Number,
            required: [true, 'Latitude is required'],
        },
        longitude: {
            type: Number,
            required: [true, 'Longitude is required'],
        },
    },
    description: {
        type: String,
        trim: true,
    },
    siteInterest: [{
        category: {
            type: String,
            required: true,
            trim: true
        },
        brands: [{
            type: String,
            trim: true
        }],
        technicians: [{
            name: {
                type: String,
                trim: true
            },
            phone: {
                type: String,
                trim: true
            }
        }]
    }],
    images: {
        type: [{
            imageNumber: {
                type: Number,
                required: true,
                min: 1,
                max: 9
            },
            imageUrl: {
                type: String,
                required: true
            }
        }],
        default: [],
        validate: {
            validator: function (images) {
                return images.length <= 9;
            },
            message: 'A site can have a maximum of 9 images'
        }
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

    // ============================================
    // ASSIGNMENT FIELDS
    // ============================================
    // Users assigned to this site (for data access control)
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

// ============================================
// ASSIGNMENT INDEXES
// ============================================
// Index for efficient queries to find sites assigned to a user
siteSchema.index({ organizationId: 1, assignedUsers: 1 });
// Index for queries combining createdBy and assignment
siteSchema.index({ organizationId: 1, createdBy: 1, assignedUsers: 1 });
// Index for category sync queries
siteSchema.index({ organizationId: 1, 'siteInterest.category': 1 });
// Index for sub-organization sync queries
siteSchema.index({ organizationId: 1, subOrganization: 1 });

const Site = mongoose.model('Site', siteSchema);

module.exports = Site;