const mongoose = require('mongoose');

// This schema is identical to Party, but panVatNumber is NOT required
// and the unique index on panVatNumber has been removed.
const prospectSchema = new mongoose.Schema({
    prospectName: {
        type: String,
        required: [true, 'Prospect name is required'],
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
    panVatNumber: { // <-- NOT REQUIRED
        type: String,
        trim: true,
        maxlength: 14,
        default: null,
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
    images: {
        type: [{
            imageNumber: {
                type: Number,
                required: true,
                min: 1,
                max: 5
            },
            imageUrl: {
                type: String,
                required: true
            }
        }],
        default: [],
        validate: {
            validator: function(images) {
                return images.length <= 5;
            },
            message: 'A Prospect can have a maximum of 5 images'
        }
    },
    // --- NEW: Prospect Interest ---
    prospectInterest: [{
        category: {
            type: String,
            required: [true, 'Category name is required'],
            trim: true
        },
        brands: [{
            type: String,
            required: [true, 'Brand name is required'],
            trim: true
        }]
    }],
    // --- END NEW ---
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
}, { timestamps: true });

// NO unique index on panVatNumber

const Prospect = mongoose.model('Prospect', prospectSchema);

module.exports = Prospect;
