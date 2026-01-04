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
    country: {
        type: String,
        trim: true,
        default: 'India',
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
    checkInTime: {
        type: String,
        trim: true,
        default: '10:00',
        validate: {
            validator: function (v) {
                return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
            },
            message: 'Check-in time must be in HH:MM format (24-hour)'
        }
    },
    checkOutTime: {
        type: String,
        trim: true,
        default: '18:00',
        validate: {
            validator: function (v) {
                return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
            },
            message: 'Check-out time must be in HH:MM format (24-hour)'
        }
    },
    halfDayCheckOutTime: {
        type: String,
        trim: true,
        default: '14:00',
        validate: {
            validator: function (v) {
                return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
            },
            message: 'Half day check-out time must be in HH:MM format (24-hour)'
        }
    },
    weeklyOffDay: {
        type: String,
        enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        default: 'Saturday',
        trim: true,
    },
    timezone: {
        type: String,
        default: 'Asia/Kolkata',
        trim: true,
        validate: {
            validator: function (v) {
                // Basic validation - checks if timezone exists in Intl
                try {
                    Intl.DateTimeFormat(undefined, { timeZone: v });
                    return true;
                } catch (e) {
                    return false;
                }
            },
            message: 'Invalid timezone. Use IANA timezone format (e.g., Asia/Kolkata, America/New_York)'
        }
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
    },
    subscriptionHistory: [{
        extendedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        extensionDate: {
            type: Date,
            default: Date.now,
            required: true
        },
        previousEndDate: {
            type: Date,
            required: true
        },
        newEndDate: {
            type: Date,
            required: true
        },
        extensionDuration: {
            type: String,
            enum: ['6months', '12months'],
            required: true
        }
    }]
}, { timestamps: true });

// Pre-save middleware to calculate subscription end date
organizationSchema.pre('save', function (next) {
    if (this.isNew || this.isModified('subscriptionType') || this.isModified('subscriptionStartDate')) {
        const startDate = this.subscriptionStartDate || new Date();
        const monthsToAdd = this.subscriptionType === '12months' ? 12 : 6;

        this.subscriptionEndDate = new Date(startDate);
        this.subscriptionEndDate.setMonth(this.subscriptionEndDate.getMonth() + monthsToAdd);
    }
    next();
});

// Virtual property to check if subscription is expired
organizationSchema.virtual('isSubscriptionActive').get(function () {
    return this.subscriptionEndDate && new Date() < this.subscriptionEndDate;
});

organizationSchema.set('toJSON', { virtuals: true });
organizationSchema.set('toObject', { virtuals: true });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;