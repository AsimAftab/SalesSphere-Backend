// src/api/subscriptions/subscriptionPlan.model.js
// Subscription Plan schema for feature-based access control

const mongoose = require('mongoose');
const { FEATURE_REGISTRY } = require('../../config/featureRegistry');

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
            'invoices',
            'estimates',
            'employees',
            'attendance',
            'leaves',
            'parties',
            'prospects',
            'sites',
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
    // Granular feature flags per module (feature-based control)
    // Structure: { moduleName: { featureKey: true/false, ... }, ... }
    // Example: { attendance: { webCheckIn: true, mobileCheckIn: true, remoteCheckIn: false } }
    moduleFeatures: {
        type: Map,
        of: {
            type: Map,
            of: Boolean
        },
        default: {}
    },
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
 * Check if a specific feature is enabled in this plan for a module
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key to check
 * @returns {boolean}
 */
subscriptionPlanSchema.methods.hasFeature = function (moduleName, featureKey) {
    // First check if module is enabled
    if (!this.enabledModules.includes(moduleName)) {
        return false;
    }
    // Check if feature is explicitly enabled in moduleFeatures
    if (this.moduleFeatures && this.moduleFeatures.get(moduleName)) {
        const moduleFeatures = this.moduleFeatures.get(moduleName);
        return moduleFeatures.get(featureKey) === true;
    }
    // If moduleFeatures not set, default to false (explicit opt-in)
    return false;
};

/**
 * Get all enabled features for a module
 * @param {string} moduleName - Module name
 * @returns {string[]} Array of enabled feature keys
 */
subscriptionPlanSchema.methods.getEnabledFeatures = function (moduleName) {
    if (!this.enabledModules.includes(moduleName)) {
        return [];
    }
    if (this.moduleFeatures && this.moduleFeatures.get(moduleName)) {
        const moduleFeatures = this.moduleFeatures.get(moduleName);
        return Array.from(moduleFeatures.entries())
            .filter(([key, value]) => value === true)
            .map(([key]) => key);
    }
    return [];
};

/**
 * Set feature flag for a module
 * @param {string} moduleName - Module name
 * @param {string} featureKey - Feature key
 * @param {boolean} enabled - Enable or disable
 */
subscriptionPlanSchema.methods.setFeature = function (moduleName, featureKey, enabled) {
    if (!this.moduleFeatures) {
        this.moduleFeatures = new Map();
    }
    if (!this.moduleFeatures.get(moduleName)) {
        this.moduleFeatures.set(moduleName, new Map());
    }
    this.moduleFeatures.get(moduleName).set(featureKey, enabled);
};

/**
 * Set all features for a module at once
 * @param {string} moduleName - Module name
 * @param {Object} features - Object with featureKey: boolean pairs
 */
subscriptionPlanSchema.methods.setModuleFeatures = function (moduleName, features) {
    if (!this.moduleFeatures) {
        this.moduleFeatures = new Map();
    }
    const featureMap = new Map();
    Object.entries(features).forEach(([key, value]) => {
        featureMap.set(key, Boolean(value));
    });
    this.moduleFeatures.set(moduleName, featureMap);
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
