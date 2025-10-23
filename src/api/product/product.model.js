const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    description: {
        type: String,
        trim: true,
        default: '',
    },
    // Corresponds to 'imageUrl' in your interface
    imageUrl: {
        type: String,
        trim: true,
        default: 'https://placehold.co/40x40/cccccc/ffffff?text=N/A'
    },
    // Corresponds to 'category' in your interface
    category: {
        type: String,
        required: [true, 'Product category is required'],
        trim: true,
        default: 'Uncategorized'
    },
    // Corresponds to 'price' in your interface
    price: {
        type: Number,
        required: [true, 'Product price is required'],
        min: [0, 'Price cannot be negative'],
        default: 0,
    },
    // Corresponds to 'piece' in your interface
    piece: {
        type: Number,
        default: 0,
        min: [0, 'Piece count cannot be negative'],
    },
    sku: {
        type: String,
        trim: true,
        default: '',
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

// Index for faster queries by organization
productSchema.index({ organizationId: 1 });
// Index for case-insensitive name search within an organization
// This helps the 'bulkUpdateProducts' logic find existing products
productSchema.index({ name: 1, organizationId: 1 }, { collation: { locale: 'en', strength: 2 } });


const Product = mongoose.model('Product', productSchema);

module.exports = Product;

