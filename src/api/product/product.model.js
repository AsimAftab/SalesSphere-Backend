const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    // --- NEW FIELD ---
    serialNo: {
        type: String,
        trim: true,
        default: null
    },
    // --- END NEW FIELD ---
    image: {
        public_id: {
            type: String,
            default: null
        },
        url: {
            type: String,
            default: null 
        }
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category', 
        required: [true, 'Product category is required'],
    },
    price: {
        type: Number,
        required: [true, 'Product price is required'],
        min: [0, 'Price cannot be negative'],
        default: 0,
    },
    qty: {
        type: Number,
        default: 0,
        min: [0, 'Quantity cannot be negative'],
    },
    isActive: {
        type: Boolean,
        default: true,
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
productSchema.index({ organizationId: 1 });
productSchema.index({ category: 1 });
// --- UPDATED: Added unique constraint ---
productSchema.index({ productName: 1, organizationId: 1 }, { 
    unique: true,
// --- END UPDATE ---
    collation: { locale: 'en', strength: 2 } 
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;