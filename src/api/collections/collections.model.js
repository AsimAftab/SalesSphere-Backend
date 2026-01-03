const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
    party: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
        required: [true, 'Party is required'],
    },
    amountReceived: {
        type: Number,
        required: [true, 'Amount received is required'],
        min: [0, 'Amount cannot be negative'],
    },
    receivedDate: {
        type: Date,
        required: [true, 'Received date is required'],
    },
    description: {
        type: String,
        trim: true,
    },
    paymentMethod: {
        type: String,
        enum: ['bank_transfer', 'cheque', 'qr', 'cash'],
        required: [true, 'Payment method is required'],
    },
    // Bank Transfer specific field
    bankName: {
        type: String,
        trim: true,
    },
    // Cheque specific fields
    chequeNumber: {
        type: String,
        trim: true,
    },
    chequeDate: {
        type: Date,
    },
    chequeStatus: {
        type: String,
        enum: ['pending', 'deposited', 'cleared', 'bounced'],
        default: 'pending',
    },
    chequeImages: [{
        type: String, // Cloudinary URLs
    }],
    // System fields
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

// Custom validation for payment method specific fields
collectionSchema.pre('validate', function (next) {
    if (this.paymentMethod === 'bank_transfer') {
        if (!this.bankName || this.bankName.trim() === '') {
            this.invalidate('bankName', 'Bank name is required for bank transfer');
        }
    }

    if (this.paymentMethod === 'cheque') {
        if (!this.bankName || this.bankName.trim() === '') {
            this.invalidate('bankName', 'Bank name is required for cheque payment');
        }
        if (!this.chequeNumber || this.chequeNumber.trim() === '') {
            this.invalidate('chequeNumber', 'Cheque number is required');
        }
        if (!this.chequeDate) {
            this.invalidate('chequeDate', 'Cheque date is required');
        }
    }

    // Limit cheque images to 2
    if (this.chequeImages && this.chequeImages.length > 2) {
        this.invalidate('chequeImages', 'Maximum 2 cheque images allowed');
    }

    next();
});

// Indexes
collectionSchema.index({ organizationId: 1 });
collectionSchema.index({ createdBy: 1 });
collectionSchema.index({ party: 1, organizationId: 1 });
collectionSchema.index({ paymentMethod: 1, organizationId: 1 });
collectionSchema.index({ receivedDate: -1, organizationId: 1 });

const Collection = mongoose.model('Collection', collectionSchema);
module.exports = Collection;
