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

// Partial unique index: invoiceNumber must be unique for INVOICES only (isEstimate: false)
invoiceSchema.index(
  { invoiceNumber: 1, organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      invoiceNumber: { $exists: true, $ne: null },
      isEstimate: false
    }
  }
);

// Partial unique index: estimateNumber must be unique for ESTIMATES only (isEstimate: true)
invoiceSchema.index(
  { estimateNumber: 1, organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      estimateNumber: { $exists: true, $ne: null },
      isEstimate: true
    }
  }
);


const Invoice = mongoose.model('Invoice', invoiceSchema);

// Fix duplicate key error: Drop old indexes and recreate with partial filter
// This ensures:
// - invoiceNumber is unique for invoices (isEstimate: false) only
// - estimateNumber is unique for estimates (isEstimate: true) only
Invoice.syncIndexes = async function() {
  try {
    const db = this.db;
    const collection = db.collection('invoices');

    // Get existing indexes
    const indexes = await collection.indexes();

    // Drop ANY old index on estimateNumber + organizationId (old sparse or non-sparse)
    const oldEstimateIndexes = indexes.filter(idx =>
      idx.key.estimateNumber === 1 && idx.key.organizationId === 1
    );
    for (const idx of oldEstimateIndexes) {
      if (idx.name) {
        await collection.dropIndex(idx.name);
        console.log(`✅ Dropped old estimateNumber index: ${idx.name}`);
      }
    }

    // Drop ANY old index on invoiceNumber + organizationId (old sparse or non-sparse)
    const oldInvoiceIndexes = indexes.filter(idx =>
      idx.key.invoiceNumber === 1 && idx.key.organizationId === 1
    );
    for (const idx of oldInvoiceIndexes) {
      if (idx.name) {
        await collection.dropIndex(idx.name);
        console.log(`✅ Dropped old invoiceNumber index: ${idx.name}`);
      }
    }
  } catch (error) {
    console.error('Error fixing invoice indexes:', error.message);
  }
};

// Call the sync function when model loads
Invoice.syncIndexes();

module.exports = Invoice;
