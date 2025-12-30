const mongoose = require('mongoose');

const expenseClaimSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Expense title is required'],
        trim: true,
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0, 'Amount cannot be negative'],
    },
    incurredDate: {
        type: Date,
        required: [true, 'Incurred date is required'],
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExpenseCategory',
        required: [true, 'Category is required'],
    },
    description: {
        type: String,
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
    receipt: {
        type: String, // Cloudinary URL for the receipt/photo
    },
    party: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party', // Optional: Link to a party if expense is related to one
    },
}, { timestamps: true });

// Indexes
expenseClaimSchema.index({ organizationId: 1 });
expenseClaimSchema.index({ createdBy: 1 });
expenseClaimSchema.index({ status: 1, organizationId: 1 });
expenseClaimSchema.index({ category: 1, organizationId: 1 });

const ExpenseClaim = mongoose.model('ExpenseClaim', expenseClaimSchema);
module.exports = ExpenseClaim;
