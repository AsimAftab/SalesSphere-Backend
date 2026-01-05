// src/api/subscriptions/subscriptionPlan.model.js
// Subscription Plan schema for feature-based access control

const mongoose = require('mongoose');

/**
 * SubscriptionPlan Schema
 * - Predefined plans: Basic, Standard, Premium
 * - Custom plans: Per-organization with flexible module selection
 */
const subscriptionPlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Plan name is required'],
        trim: true
    },
    tier: {
        type: String,
        enum: ['basic', 'standard', 'premium', 'custom'],
        required: [true, 'Plan tier is required']
    },
    description: {
        type: String,
        trim: true
    },
    // Modules enabled for this plan
    enabledModules: [{
        type: String,
        enum: [
            'dashboard',
            'liveTracking',
            'products',
            'orderLists',
            'employees',
            'attendance',
            'leaves',
            'parties',
            'prospects',
            'sites',
            'rawMaterials',
            'analytics',
            'beatPlan',
            'tourPlan',
            'collections',
            'expenses',
            'odometer',
            'notes',
            'miscellaneousWork',
            'settings'
        ]
    }],
    // Maximum number of employees allowed under this plan
    maxEmployees: {
        type: Number,
        required: [true, 'Max employees limit is required'],
        min: [1, 'At least 1 employee must be allowed']
    },
    // Pricing (for reference, actual billing handled separately)
    price: {
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' },
        billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'yearly' }
    },
    // For custom plans: which organization this plan belongs to
    // null for predefined plans (Basic, Standard, Premium)
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null
    },
    // System-defined plans cannot be deleted
    isSystemPlan: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Index for quick lookup
subscriptionPlanSchema.index({ tier: 1, isSystemPlan: 1 });
subscriptionPlanSchema.index({ organizationId: 1 });

/**
 * Check if a module is enabled in this plan
 * @param {string} moduleName - Module to check
 * @returns {boolean}
 */
subscriptionPlanSchema.methods.hasModule = function (moduleName) {
    return this.enabledModules.includes(moduleName);
};

/**
 * Check if employee limit allows adding more
 * @param {number} currentCount - Current number of employees
 * @returns {boolean}
 */
subscriptionPlanSchema.methods.canAddEmployee = function (currentCount) {
    return currentCount < this.maxEmployees;
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlan;
