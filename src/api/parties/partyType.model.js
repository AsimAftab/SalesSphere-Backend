const mongoose = require('mongoose');

const partyTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Party type name is required'],
        trim: true,
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });

// Ensure names are unique per organization
partyTypeSchema.index({ name: 1, organizationId: 1 }, {
    unique: true,
    collation: { locale: 'en', strength: 2 }
});

module.exports = mongoose.model('PartyType', partyTypeSchema);
