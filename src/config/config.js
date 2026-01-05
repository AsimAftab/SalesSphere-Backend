// src/config/config.js
const mongoose = require('mongoose');
const { seedSubscriptionPlans } = require('../utils/seedSubscriptionPlans');

const connectDB = async () => {
    // Choose the correct URI based on the environment
    const mongoURI = process.env.NODE_ENV === 'local_development'
        ? process.env.MONGO_URI_LOCAL
        : process.env.MONGO_URI_CLOUD;

    try {
        await mongoose.connect(mongoURI, {});
        console.log(`MongoDB Connected in ${process.env.NODE_ENV || 'development'} mode...`);

        // Seed default subscription plans if they don't exist
        await seedSubscriptionPlans();
    } catch (err) {
        console.error('Error Connecting to MongoDB: ', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;