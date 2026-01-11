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
    // Generic Images (Bank Transfer receipt, Cheque photo, QR screenshot)
    images: [{
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
    // 1. Bank Transfer
    if (this.paymentMethod === 'bank_transfer') {
        if (!this.bankName || this.bankName.trim() === '') {
            this.invalidate('bankName', 'Bank name is required for bank transfer');
        }
    }

    // 2. Cheque
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

    // 3. QR Code
    // No specific extra fields required for QR besides generic ones, but images encouraged

    // 4. Cash
    // Typically no bankName or extra fields

    // IMAGE VALIDATION
    if (this.images && this.images.length > 0) {
        // Cash should not have images (business rule per user request)
        if (this.paymentMethod === 'cash') {
            this.invalidate('images', 'Images are not allowed for cash payments');
        }
        // Limit images to 3
        if (this.images.length > 3) {
            this.invalidate('images', 'Maximum 3 images allowed');
        }
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
