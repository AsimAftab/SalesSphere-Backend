const mongoose = require('mongoose');

// Backup schema for archived location tracking with TTL
const locationTrackingBackupSchema = new mongoose.Schema({
    // Original tracking ID for reference
    originalId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    // Reference to the archived beat plan
    beatPlanBackupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BeatPlanBackup',
        index: true,
    },
    // Original beat plan ID (for cross-reference)
    originalBeatPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    sessionStartedAt: {
        type: Date,
        required: true,
    },
    sessionEndedAt: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'completed'],
        default: 'completed',
    },
    // Location breadcrumb trail
    locations: [{
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        accuracy: Number,
        speed: Number,
        heading: Number,
        timestamp: { type: Date, required: true },
        address: {
            formattedAddress: String,
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String,
            locality: String,
        },
        nearestDirectory: {
            directoryId: mongoose.Schema.Types.ObjectId,
            directoryType: {
                type: String,
                enum: ['party', 'site', 'prospect'],
            },
            name: String,
            distance: Number,
        },
    }],
    currentLocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        timestamp: Date,
        address: {
            formattedAddress: String,
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String,
            locality: String,
        },
    },
    summary: {
        totalDistance: { type: Number, default: 0 },
        totalDuration: { type: Number, default: 0 },
        averageSpeed: { type: Number, default: 0 },
        directoriesVisited: { type: Number, default: 0 },
    },
    // Archive metadata
    archivedAt: {
        type: Date,
        default: Date.now,
        required: true,
    },
    // TTL field - document expires 10 days after archival
    expireAt: {
        type: Date,
        required: true,
        index: { expires: 0 }, // TTL index
    },
}, { timestamps: true });

// Set expireAt to 10 days from archivedAt
locationTrackingBackupSchema.pre('save', function (next) {
    if (!this.expireAt) {
        const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
        this.expireAt = new Date(this.archivedAt.getTime() + TEN_DAYS_MS);
    }
    next();
});

// Indexes
locationTrackingBackupSchema.index({ organizationId: 1, archivedAt: -1 });

const LocationTrackingBackup = mongoose.model('LocationTrackingBackup', locationTrackingBackupSchema);

module.exports = LocationTrackingBackup;
