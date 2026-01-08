
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SubscriptionPlan = require('../src/api/subscriptions/subscriptionPlan.model');

// Connect to Database
const connectDB = async () => {
    // Replica of src/config/config.js logic
    const mongoURI = process.env.NODE_ENV === 'local_development'
        ? process.env.MONGO_URI_LOCAL
        : process.env.MONGO_URI_CLOUD;

    if (!mongoURI) {
        console.error('Error: MongoDB URI not found in environment variables.');
        console.error('Debug: NODE_ENV =', process.env.NODE_ENV);
        process.exit(1);
    }

    try {
        const conn = await mongoose.connect(mongoURI);
        console.log(`MongoDB Connected: ${conn.connection.host} (${process.env.NODE_ENV || 'cloud'})`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const fixSubscriptionModules = async () => {
    await connectDB();

    try {
        console.log('Starting SubscriptionPlan migration...');

        const plans = await SubscriptionPlan.find({});
        console.log(`Found ${plans.length} plans.`);

        let updatedCount = 0;

        for (const plan of plans) {
            let changed = false;
            let logMsg = `Plan "${plan.name}" (${plan._id}): `;
            let updates = [];

            // 1. Rename 'orderLists' -> 'invoices'
            if (plan.enabledModules.includes('orderLists')) {
                // Remove 'orderLists'
                plan.enabledModules = plan.enabledModules.filter(m => m !== 'orderLists');
                updates.push(`Removed 'orderLists'`);

                // Add 'invoices' if not present
                if (!plan.enabledModules.includes('invoices')) {
                    plan.enabledModules.push('invoices');
                    updates.push(`Added 'invoices'`);
                }

                // Also ensures 'estimates' is added if 'invoices' is enabled
                if (!plan.enabledModules.includes('estimates')) {
                    plan.enabledModules.push('estimates');
                    updates.push(`Added 'estimates'`);
                }

                changed = true;
            }

            // 2. Remove 'rawMaterials'
            if (plan.enabledModules.includes('rawMaterials')) {
                plan.enabledModules = plan.enabledModules.filter(m => m !== 'rawMaterials');
                updates.push(`Removed 'rawMaterials'`);
                changed = true;
            }

            // 3. Ensure 'estimates' is present if 'invoices' is present (consistency check)
            if (plan.enabledModules.includes('invoices') && !plan.enabledModules.includes('estimates')) {
                plan.enabledModules.push('estimates');
                updates.push(`Added 'estimates' (consistency)`);
                changed = true;
            }

            if (changed) {
                await plan.save();
                updatedCount++;
                console.log(logMsg + updates.join(', '));
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} plans.`);
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

fixSubscriptionModules();
