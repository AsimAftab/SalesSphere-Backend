const mongoose = require('mongoose');

const tourPlanSchema = new mongoose.Schema({
    placeOfVisit: {
        type: String,
        required: [true, 'Place of visit is required'],
        trim: true,
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required'],
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required'],
    },
    purposeOfVisit: {
        type: String,
        required: [true, 'Purpose of visit is required'],
        trim: true,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
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
    rejectionReason: {
        type: String,
        trim: true,
    },
}, { timestamps: true });

// Indexes
tourPlanSchema.index({ organizationId: 1 });
tourPlanSchema.index({ createdBy: 1 });
tourPlanSchema.index({ status: 1, organizationId: 1 });
tourPlanSchema.index({ startDate: 1, endDate: 1, organizationId: 1 });

const TourPlan = mongoose.model('TourPlan', tourPlanSchema);
module.exports = TourPlan;
