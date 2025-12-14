const mongoose = require('mongoose');

const siteSubOrganizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Sub-organization name is required'],
        trim: true,
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });

// Ensure names are unique per organization
siteSubOrganizationSchema.index({ name: 1, organizationId: 1 }, {
    unique: true,
    collation: { locale: 'en', strength: 2 }
});

module.exports = mongoose.model('SiteSubOrganization', siteSubOrganizationSchema);
