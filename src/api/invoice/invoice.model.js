const mongoose = require('mongoose');

// --- Item schema with discount ---
const invoiceItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    productName: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100, // Discount percentage (0-100)
    },
    total: {
        type: Number,
        required: true,
    }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
    party: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
        required: [true, 'A party is required for an invoice'],
    },

    // --- Copied Organization Data (FOR PDF) ---
    organizationName: {
        type: String,
        required: true,
    },
    organizationPanVatNumber: {
        type: String,
        required: true,
    },
    organizationAddress: {
        type: String,
        required: true,
    },
    organizationPhone: {
        type: String,
        required: true,
    },
    // --- END ---

    // --- Copied Party Data (FOR PDF) ---
    partyName: {
        type: String,
        required: true,
    },
    partyOwnerName: {
        type: String,
        required: true,
    },
    partyAddress: {
        type: String,
    },
    partyPanVatNumber: {
        type: String,
        required: [true, 'Party PAN/VAT is required for invoice'],
    },
    // --- END Copied Data ---

    // --- Estimate/Invoice Type ---
    isEstimate: {
        type: Boolean,
        default: false,
    },
    estimateNumber: {
        type: String,
        // Only required for estimates, set when isEstimate is true
    },
    // --- END Estimate Fields ---

    invoiceNumber: {
        type: String,
        // Not required for estimates, only set when converted to invoice
    },
    expectedDeliveryDate: {
        type: Date,
        // Required for invoices, optional for estimates
    },
    items: [invoiceItemSchema],

    subtotal: {
        type: Number,
        required: true,
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100, // Discount percentage (0-100)
    },
    totalAmount: {
        type: Number,
        required: true,
    },

    status: {
        type: String,
        enum: ['pending', 'in progress', 'in transit', 'completed', 'rejected'],
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
    }
}, { timestamps: true });

// Indexes
invoiceSchema.index({ organizationId: 1 });
invoiceSchema.index({ party: 1 });
invoiceSchema.index({ isEstimate: 1, organizationId: 1 });
// Sparse index for invoiceNumber (only indexed when present)
invoiceSchema.index({ invoiceNumber: 1, organizationId: 1 }, { unique: true, sparse: true });
// Sparse index for estimateNumber
invoiceSchema.index({ estimateNumber: 1, organizationId: 1 }, { unique: true, sparse: true });


const Invoice = mongoose.model('Invoice', invoiceSchema);
module.exports = Invoice;
