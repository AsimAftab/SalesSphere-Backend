const mongoose = require('mongoose');

// --- This schema is unchanged ---
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
        required: [true, 'Party address is required for invoice'],
    },
    partyPanVatNumber: {
        type: String,
        required: [true, 'Party PAN/VAT is required for invoice'],
    },
    // --- END Copied Data ---

    invoiceNumber: {
        type: String,
        required: true,
        // Note: Uniqueness is enforced by compound index (invoiceNumber + organizationId)
    },
    expectedDeliveryDate: {
        type: Date,
        required: [true, 'Expected delivery date is required'],
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

// ... indexes are unchanged ...
invoiceSchema.index({ organizationId: 1 });
invoiceSchema.index({ party: 1 });
invoiceSchema.index({ invoiceNumber: 1, organizationId: 1 }, { unique: true });


const Invoice = mongoose.model('Invoice', invoiceSchema);
module.exports = Invoice;
