const mongoose = require('mongoose');

// Location tracking schema for real-time beat plan execution
const locationTrackingSchema = new mongoose.Schema({
    // Reference to the beat plan being tracked
    beatPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BeatPlan',
        required: true,
        index: true,
    },
    // Salesperson being tracked
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // Organization for tenant isolation
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    // Tracking session metadata
    sessionStartedAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
    sessionEndedAt: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'completed'],
        default: 'active',
    },
    // Location breadcrumb trail
    locations: [{
        latitude: {
            type: Number,
            required: true,
        },
        longitude: {
            type: Number,
            required: true,
        },
        accuracy: {
            type: Number, // GPS accuracy in meters
        },
        speed: {
            type: Number, // Speed in m/s
        },
        heading: {
            type: Number, // Direction in degrees (0-360)
        },
        timestamp: {
            type: Date,
            required: true,
            default: Date.now,
        },
        // Reverse geocoded address for breadcrumbs
        address: {
            formattedAddress: String, // Full address string
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String,
            locality: String, // Neighborhood/area name
        },
        // Optional: which directory was nearest at this point
        nearestDirectory: {
            directoryId: mongoose.Schema.Types.ObjectId,
            directoryType: {
                type: String,
                enum: ['party', 'site', 'prospect'],
            },
            name: String, // Directory name
            distance: Number, // Distance in meters
        },
    }],
    // Current location (last recorded)
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
    // Summary statistics
    summary: {
        totalDistance: {
            type: Number,
            default: 0, // Total distance traveled in km
        },
        totalDuration: {
            type: Number,
            default: 0, // Total duration in minutes
        },
        averageSpeed: {
            type: Number,
            default: 0, // Average speed in km/h
        },
        directoriesVisited: {
            type: Number,
            default: 0,
        },
    },
}, { timestamps: true });

// Compound index for efficient querying
locationTrackingSchema.index({ beatPlanId: 1, userId: 1, status: 1 });
locationTrackingSchema.index({ organizationId: 1, status: 1, sessionStartedAt: -1 });

// Method to calculate total distance traveled
locationTrackingSchema.methods.calculateTotalDistance = function() {
    if (this.locations.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 1; i < this.locations.length; i++) {
        const prev = this.locations[i - 1];
        const curr = this.locations[i];
        totalDistance += calculateHaversineDistance(
            prev.latitude,
            prev.longitude,
            curr.latitude,
            curr.longitude
        );
    }
    return totalDistance;
};

// Helper function for Haversine formula (calculate distance between two points)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

const LocationTracking = mongoose.model('LocationTracking', locationTrackingSchema);

module.exports = LocationTracking;
