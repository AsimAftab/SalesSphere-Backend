const mongoose = require('mongoose');

// Backup schema for archived beat plans
const beatPlanBackupSchema = new mongoose.Schema({
    // Original beat plan ID for reference
    originalId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    // Copy of original beat plan data
    name: {
        type: String,
        required: true,
        trim: true,
    },
    employees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    parties: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
    }],
    sites: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
    }],
    prospects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prospect',
    }],
    visits: [{
        directoryId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        directoryType: {
            type: String,
            enum: ['party', 'site', 'prospect'],
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
        visitLocation: {
            latitude: Number,
            longitude: Number,
        },
    }],
    schedule: {
        daysOfWeek: [{
            type: Number,
            min: 0,
            max: 6,
        }],
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'custom'],
            default: 'weekly',
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
        },
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'completed'],
        default: 'completed',
    },
    startedAt: {
        type: Date,
    },
    completedAt: {
        type: Date,
    },
    progress: {
        totalDirectories: { type: Number, default: 0 },
        visitedDirectories: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        totalParties: { type: Number, default: 0 },
        totalSites: { type: Number, default: 0 },
        totalProspects: { type: Number, default: 0 },
    },
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
    // Archive metadata
    archivedAt: {
        type: Date,
        default: Date.now,
        required: true,
    },
    // Original timestamps
    originalCreatedAt: {
        type: Date,
    },
    originalUpdatedAt: {
        type: Date,
    },
}, { timestamps: true });

// Indexes for efficient querying
beatPlanBackupSchema.index({ organizationId: 1, archivedAt: -1 });
beatPlanBackupSchema.index({ organizationId: 1, 'employees': 1 });

const BeatPlanBackup = mongoose.model('BeatPlanBackup', beatPlanBackupSchema);

module.exports = BeatPlanBackup;
