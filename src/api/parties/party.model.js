const mongoose = require('mongoose');

// This schema is based on your 'PartyDetails' interface
const partySchema = new mongoose.Schema({
    // Corresponds to 'name'
    name: {
        type: String,
        required: [true, 'Party name is required'],
        trim: true,
    },
    // Corresponds to 'location' or 'designation'
    location: {
        type: String,
        trim: true,
        default: '',
    },
    // Corresponds to 'imageUrl'
    imageUrl: {
        type: String,
        trim: true,
        default: 'https://placehold.co/100x100/E2E8F0/4A5568?text=N/A'
    },
    // Corresponds to 'ownerName'
    ownerName: {
        type: String,
        trim: true,
        default: '',
    },
    // Corresponds to 'panVat'
    panVat: {
        type: String,
        required: [true, 'PAN/VAT number is required'],
        trim: true,
    },
    // Corresponds to 'contact'
    contact: {
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        phone: {
            type: String,
            trim: true,
            required: [true, 'Party phone number is required'],
        },
        address: {
            type: String,
            trim: true,
            default: '',
        }
    },
    // --- Backend-specific fields ---
    isActive: {
        type: Boolean,
        default: true,
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
    }
}, { timestamps: true });

// Index for faster queries by organization
partySchema.index({ organizationId: 1 });
// Index for finding a party by PAN/VAT within an org
// Set as unique so you don't have duplicate parties in one org
partySchema.index({ panVat: 1, organizationId: 1 }, { unique: true });


const Party = mongoose.model('Party', partySchema);

module.exports = Party;

