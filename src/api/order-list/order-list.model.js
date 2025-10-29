const mongoose = require('mongoose');

// This is the sub-document schema for items *inside* an order
const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    productName: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1'],
    },
    // This is the price of the product *at the time of purchase*
    price: {
        type: Number,
        required: true,
    }
}, { _id: false }); // _id: false stops Mongoose from creating sub-document IDs

// This is the main order schema
const orderSchema = new mongoose.Schema({
    // --- Linkage Fields ---
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
    partyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
        required: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // --- Party/Client Details (denormalized for easy display) ---
    partyName: {
        type: String,
        required: true,
        trim: true,
    },
    address: {
        type: String,
        trim: true,
    },
    panVat: {
        type: String,
        required: true,
        trim: true,
    },
    // --- Order Details ---
    // This matches your '0001', '0002' format
    orderNumber: {
        type: String,
        required: true,
        unique: true, // This should ideally be unique per organization
    },
    orderDate: {
        type: Date,
        default: Date.now,
    },
    items: [orderItemSchema], // Array of items
    totalAmount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        // Matches your mock service's types
        enum: ['Pending', 'In Progress', 'Completed', 'Rejected'],
        default: 'Pending',
    },
    isActive: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

// Helper to auto-increment orderNumber (basic version)
// For a production app, a more robust counter solution is recommended
orderSchema.pre('save', async function (next) {
    if (this.isNew) {
        // Find the last order to determine the next number
        const lastOrder = await this.constructor.findOne(
            { organizationId: this.organizationId },
            {},
            { sort: { 'createdAt': -1 } }
        );

        let nextNumber = 1;
        if (lastOrder && lastOrder.orderNumber) {
            nextNumber = parseInt(lastOrder.orderNumber, 10) + 1;
        }
        
        // Format as '01', '02', etc.
        this.orderNumber = nextNumber.toString().padStart(2, '0');
    }
    next();
});

// Index for getting all orders for a party
orderSchema.index({ partyId: 1, organizationId: 1 });
// Index for filtering by panVat
orderSchema.index({ panVat: 1, organizationId: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;