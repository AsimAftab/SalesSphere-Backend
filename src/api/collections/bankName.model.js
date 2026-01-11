const mongoose = require('mongoose');

const bankNameSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Bank name is required'],
        trim: true,
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });

// Ensure names are unique per organization (case-insensitive)
bankNameSchema.index({ name: 1, organizationId: 1 }, {
    unique: true,
    collation: { locale: 'en', strength: 2 }
});

module.exports = mongoose.model('BankName', bankNameSchema);
