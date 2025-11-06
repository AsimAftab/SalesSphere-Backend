const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });

// Add a compound index to ensure category names are unique per organization
categorySchema.index({ name: 1, organizationId: 1 }, { 
    unique: true,
    // This makes the unique check case-insensitive (e.g., "Food" and "food" are duplicates)
    collation: { locale: 'en', strength: 2 } 
});
categorySchema.index({ organizationId: 1 });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;