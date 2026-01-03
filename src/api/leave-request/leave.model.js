const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
    startDate: {
        type: Date,
        required: [true, 'Start date is required'],
    },
    endDate: {
        type: Date, // Optional - if not provided, it's a single day leave
    },
    category: {
        type: String,
        enum: [
            'sick_leave',
            'maternity_leave',
            'paternity_leave',
            'compassionate_leave',
            'religious_holidays',
            'family_responsibility',
            'miscellaneous'
        ],
        required: [true, 'Leave category is required'],
    },
    reason: {
        type: String,
        required: [true, 'Reason is required'],
        trim: true,
    },
    leaveDays: {
        type: Number,
        required: [true, 'Leave days is required'],
        min: [1, 'Leave days must be at least 1'],
        default: 1,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    rejectionReason: {
        type: String,
        trim: true,
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
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    approvedAt: {
        type: Date,
    },
}, { timestamps: true });

// Virtual field to calculate number of days
leaveRequestSchema.virtual('numberOfDays').get(function () {
    if (!this.endDate) return 1;
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
    return diffDays;
});

// Ensure virtuals are included in JSON
leaveRequestSchema.set('toJSON', { virtuals: true });
leaveRequestSchema.set('toObject', { virtuals: true });

// Indexes
leaveRequestSchema.index({ organizationId: 1 });
leaveRequestSchema.index({ createdBy: 1 });
leaveRequestSchema.index({ status: 1, organizationId: 1 });
leaveRequestSchema.index({ startDate: -1, organizationId: 1 });

const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
module.exports = LeaveRequest;
