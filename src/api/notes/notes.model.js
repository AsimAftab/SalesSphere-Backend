const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true,
    },
    // Optional references
    party: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
    },
    prospect: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prospect',
    },
    site: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
    },
    // Two optional images
    images: [{
        imageNumber: { type: Number, min: 1, max: 2 },
        imageUrl: { type: String, trim: true },
        publicId: { type: String, trim: true } // Store publicId for easier deletion
    }],
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

// Indexes for efficient querying
noteSchema.index({ organizationId: 1, createdAt: -1 });
noteSchema.index({ createdBy: 1 });
noteSchema.index({ party: 1, organizationId: 1 });
noteSchema.index({ prospect: 1, organizationId: 1 });
noteSchema.index({ site: 1, organizationId: 1 });

module.exports = mongoose.model('Note', noteSchema);
