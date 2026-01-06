/**
 * Seed Subscription Plans
 *
 * This file handles database operations for subscription plan seeding.
 * Plan definitions are imported from src/config/planRegistry.js
 */

const SubscriptionPlan = require('../api/subscriptions/subscriptionPlan.model');
const { DEFAULT_PLANS } = require('../config/planRegistry');

/**
 * Seeds subscription plans into the database.
 * Uses upsert to update existing plans if configuration changes.
 *
 * This ensures that if you change price, features, or modules in planRegistry.js,
 * the database updates automatically on server restart.
 */
const seedSubscriptionPlans = async () => {
    try {
        console.log('🌱 Seeding Subscription Plans...');

        for (const planData of DEFAULT_PLANS) {
            // Use findOneAndUpdate with upsert: true
            // This ensures if you change the price or features in code, the DB updates on restart.
            await SubscriptionPlan.findOneAndUpdate(
                { tier: planData.tier, isSystemPlan: true }, // Search Criteria
                { $set: planData }, // Update Data
                { upsert: true, new: true, setDefaultsOnInsert: true } // Options
            );

            // console.log(`   ✅ Synced ${planData.name}`);
        }

        console.log('✨ Subscription plans synced with Plan Registry');
    } catch (error) {
        console.error('❌ Error seeding subscription plans:', error.message);
    }
};

module.exports = { seedSubscriptionPlans };
