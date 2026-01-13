const mongoose = require('mongoose');

const odometerSchema = new mongoose.Schema({
    // The employee who this record belongs to
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // The date of the odometer reading (normalized to start of day UTC)
    date: {
        type: Date,
        required: true,
    },
    // Status: not_started, in_progress, completed
    status: {
        type: String,
        required: true,
        enum: ['not_started', 'in_progress', 'completed'],
        default: 'not_started',
    },
    // Trip number for multiple entries per day (auto-incremented)
    tripNumber: {
        type: Number,
        default: 1,
        min: [1, 'Trip number must be at least 1'],
    },

    // ========== START FIELDS ==========
    startReading: {
        type: Number,
        min: [0, 'Start reading cannot be negative'],
    },
    startUnit: {
        type: String,
        enum: ['km', 'miles'],
    },
    startImage: {
        type: String, // Cloudinary URL
        trim: true,
    },
    startDescription: {
        type: String,
        trim: true,
    },
    startTime: {
        type: Date, // Timestamp when start was recorded
    },
    startLocation: {
        latitude: Number,
        longitude: Number,
        address: {
            type: String,
            trim: true,
        },
    },

    // ========== STOP FIELDS ==========
    stopReading: {
        type: Number,
        min: [0, 'Stop reading cannot be negative'],
    },
    stopUnit: {
        type: String,
        enum: ['km', 'miles'],
    },
    stopImage: {
        type: String, // Cloudinary URL
        trim: true,
    },
    stopDescription: {
        type: String,
        trim: true,
    },
    stopTime: {
        type: Date, // Timestamp when stop was recorded
    },
    stopLocation: {
        latitude: Number,
        longitude: Number,
        address: {
            type: String,
            trim: true,
        },
    },

    // ========== SYSTEM FIELDS ==========
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });

// Unique index to allow multiple trips per day but prevent duplicates
odometerSchema.index({ employee: 1, date: 1, organizationId: 1, tripNumber: 1 }, { unique: true });

// Indexes for faster reporting
odometerSchema.index({ organizationId: 1, date: 1 });
odometerSchema.index({ employee: 1, organizationId: 1 });

const Odometer = mongoose.model('Odometer', odometerSchema);

module.exports = Odometer;
