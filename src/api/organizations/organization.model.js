const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Organization name is required'],
        trim: true,
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // Not required during creation - set during admin registration flow
    },
    panVatNumber: {
        type: String,
        required: [true, 'PAN/VAT number is required'],
        trim: true,
        unique: true,
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
    },
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
    },
    latitude: {
        type: Number,
        min: -90,
        max: 90,
    },
    longitude: {
        type: Number,
        min: -180,
        max: 180,
    },
    googleMapLink: {
        type: String,
        trim: true,
    },
    subscriptionType: {
        type: String,
        enum: ['6months', '12months'],
        required: [true, 'Subscription type is required'],
        default: '6months',
    },
    subscriptionStartDate: {
        type: Date,
        default: Date.now,
    },
    subscriptionEndDate: {
        type: Date,
    },
    isActive: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

// Pre-save middleware to calculate subscription end date
organizationSchema.pre('save', function(next) {
    if (this.isNew || this.isModified('subscriptionType') || this.isModified('subscriptionStartDate')) {
        const startDate = this.subscriptionStartDate || new Date();
        const monthsToAdd = this.subscriptionType === '12months' ? 12 : 6;

        this.subscriptionEndDate = new Date(startDate);
        this.subscriptionEndDate.setMonth(this.subscriptionEndDate.getMonth() + monthsToAdd);
    }
    next();
});

// Virtual property to check if subscription is expired
organizationSchema.virtual('isSubscriptionActive').get(function() {
    return this.subscriptionEndDate && new Date() < this.subscriptionEndDate;
});

organizationSchema.set('toJSON', { virtuals: true });
organizationSchema.set('toObject', { virtuals: true });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;