const mongoose = require('mongoose');

const miscellaneousWorkSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Employee is required'],
    },
    natureOfWork: {
        type: String,
        required: [true, 'Nature of work is required'],
        trim: true,
    },
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
    },
    latitude: {
        type: Number,
    },
    longitude: {
        type: Number,
    },
    assignedBy: {
        type: String,
        required: [true, 'Assigned by is required'],
        trim: true,
    },
    images: [{
        imageNumber: { type: Number, min: 1, max: 2 },
        imageUrl: { type: String, trim: true }
    }],
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
    // For date-based filtering
    workDate: {
        type: Date,
        required: [true, 'Work date is required'],
        default: Date.now
    }
}, { timestamps: true });

// Index for efficient querying by organization and date
miscellaneousWorkSchema.index({ organizationId: 1, workDate: -1 });

module.exports = mongoose.model('MiscellaneousWork', miscellaneousWorkSchema);
