// src/utils/seedSubscriptionPlans.js
// Seed default subscription plans on server startup

const SubscriptionPlan = require('../api/subscriptions/subscriptionPlan.model');

// Module lists for each tier
const BASIC_MODULES = [
    'dashboard',
    'attendance',
    'leaves',
    'products',
    'parties',
    'orderLists'
];

const STANDARD_MODULES = [
    ...BASIC_MODULES,
    'collections',
    'expenses',
    'prospects',
    'sites',
    'beatPlan',
    'tourPlan',
    'notes',
    'miscellaneousWork'
];

const PREMIUM_MODULES = [
    ...STANDARD_MODULES,
    'liveTracking',
    'analytics',
    'rawMaterials',
    'odometer',
    'settings',
    'employees' // Full employee management
];

const DEFAULT_PLANS = [
    {
        name: 'Basic',
        tier: 'basic',
        description: 'Essential features for small teams',
        enabledModules: BASIC_MODULES,
        maxEmployees: 5,
        price: { amount: 2999, currency: 'INR', billingCycle: 'yearly' },
        isSystemPlan: true
    },
    {
        name: 'Standard',
        tier: 'standard',
        description: 'Advanced features for growing businesses',
        enabledModules: STANDARD_MODULES,
        maxEmployees: 25,
        price: { amount: 7999, currency: 'INR', billingCycle: 'yearly' },
        isSystemPlan: true
    },
    {
        name: 'Premium',
        tier: 'premium',
        description: 'Full access with analytics and live tracking',
        enabledModules: PREMIUM_MODULES,
        maxEmployees: 50,
        price: { amount: 14999, currency: 'INR', billingCycle: 'yearly' },
        isSystemPlan: true
    }
];

/**
 * Seed default subscription plans if they don't exist
 * Call this on server startup
 */
const seedSubscriptionPlans = async () => {
    try {
        for (const planData of DEFAULT_PLANS) {
            const existingPlan = await SubscriptionPlan.findOne({
                tier: planData.tier,
                isSystemPlan: true
            });

            if (!existingPlan) {
                await SubscriptionPlan.create(planData);
                console.log(`✅ Created ${planData.name} subscription plan`);
            }
        }
        console.log('📋 Subscription plans seeding complete');
    } catch (error) {
        console.error('❌ Error seeding subscription plans:', error.message);
    }
};

module.exports = {
    seedSubscriptionPlans,
    BASIC_MODULES,
    STANDARD_MODULES,
    PREMIUM_MODULES,
    DEFAULT_PLANS
};
