/**
 * Migration Script: Add sessionExpiresAt to all existing users
 *
 * This script adds the sessionExpiresAt field to all users who don't have it.
 * Sets it to 30 days from now for existing users.
 *
 * Run this once: node migrations/add-session-expiry.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load .env from project root (parent directory)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Determine which MongoDB URI to use based on NODE_ENV
const mongoURI = process.env.NODE_ENV === 'local_development'
    ? process.env.MONGO_URI_LOCAL
    : process.env.MONGO_URI_CLOUD;

async function migrateUsers() {
    try {
        console.log('📋 Environment Info:');
        console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`   - Using: ${process.env.NODE_ENV === 'local_development' ? 'Local MongoDB' : 'Cloud MongoDB'}`);
        console.log(`   - Max Session Days: ${process.env.MAX_SESSION_DURATION_DAYS || '30 (default)'}`);

        if (!mongoURI) {
            console.error('❌ MongoDB URI is undefined!');
            console.error('   Make sure MONGO_URI_LOCAL or MONGO_URI_CLOUD is set in .env');
            process.exit(1);
        }

        console.log('\n🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        // Find all users who don't have sessionExpiresAt field
        const usersWithoutSession = await User.find({
            sessionExpiresAt: { $exists: false }
        });

        console.log(`📊 Found ${usersWithoutSession.length} users without sessionExpiresAt`);

        if (usersWithoutSession.length === 0) {
            console.log('✅ All users already have sessionExpiresAt field. Nothing to do!');
            process.exit(0);
        }

        // Set sessionExpiresAt based on environment variable (default 30 days)
        const maxSessionDays = parseInt(process.env.MAX_SESSION_DURATION_DAYS) || 30;
        const sessionExpiryDate = new Date(Date.now() + maxSessionDays * 24 * 60 * 60 * 1000);

        const result = await User.updateMany(
            { sessionExpiresAt: { $exists: false } },
            {
                $set: {
                    sessionExpiresAt: sessionExpiryDate
                }
            }
        );

        console.log(`✅ Migration completed!`);
        console.log(`   - Updated ${result.modifiedCount} users`);
        console.log(`   - Max session duration: ${maxSessionDays} days`);
        console.log(`   - sessionExpiresAt set to: ${sessionExpiryDate.toISOString()}`);
        console.log(`   - Users will need to re-login after: ${sessionExpiryDate.toLocaleString()}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateUsers();
