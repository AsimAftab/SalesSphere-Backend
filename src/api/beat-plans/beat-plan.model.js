const mongoose = require('mongoose');

const beatPlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Beat plan name is required'],
        trim: true,
    },
    // Assigned employees/salespersons to this beat plan
    employees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    // Parties (shops) included in this beat plan
    parties: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
    }],
    // Visit tracking for each party
    visits: [{
        partyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Party',
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'visited', 'skipped'],
            default: 'pending',
        },
        visitedAt: {
            type: Date,
        },
        // Location when visited (for verification)
        visitLocation: {
            latitude: Number,
            longitude: Number,
        },
    }],
    // Schedule information
    schedule: {
        // Days of the week: 0 = Sunday, 1 = Monday, etc.
        daysOfWeek: [{
            type: Number,
            min: 0,
            max: 6,
        }],
        // Frequency: daily, weekly, monthly, custom
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'custom'],
            default: 'weekly',
        },
        // Start and end dates for the beat plan
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
        },
        endDate: {
            type: Date,
        },
    },
    // Status of the beat plan
    status: {
        type: String,
        enum: ['pending', 'active', 'completed'],
        default: 'pending',
    },
    // Progress tracking
    progress: {
        totalParties: {
            type: Number,
            default: 0,
        },
        visitedParties: {
            type: Number,
            default: 0,
        },
        percentage: {
            type: Number,
            default: 0,
        },
    },
    // Multi-tenant fields
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

// Index for efficient querying by organization
beatPlanSchema.index({ organizationId: 1 });
beatPlanSchema.index({ organizationId: 1, status: 1 });

const BeatPlan = mongoose.model('BeatPlan', beatPlanSchema);

module.exports = BeatPlan;
