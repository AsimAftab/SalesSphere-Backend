const mongoose = require('mongoose');

const prospectCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
    },
    brands: [{
        type: String,
        trim: true
    }],
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });

// Ensure category names are unique per organization
prospectCategorySchema.index({ name: 1, organizationId: 1 }, {
    unique: true,
    collation: { locale: 'en', strength: 2 }
});

module.exports = mongoose.model('ProspectCategory', prospectCategorySchema);
