const mongoose = require('mongoose');

// BeatPlanList - Template for reusable beat plan routes
const beatPlanListSchema = new mongoose.Schema({
    // Template name
    name: {
        type: String,
        required: [true, 'Beat plan template name is required'],
        trim: true,
    },
    // Parties (shops) included in this route template
    parties: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Party',
    }],
    // Sites included in this route template
    sites: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
    }],
    // Prospects included in this route template
    prospects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prospect',
    }],
    // Summary stats for quick display
    totalDirectories: {
        type: Number,
        default: 0,
    },
    totalParties: {
        type: Number,
        default: 0,
    },
    totalSites: {
        type: Number,
        default: 0,
    },
    totalProspects: {
        type: Number,
        default: 0,
    },
    // Multi-tenant fields
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
beatPlanListSchema.index({ organizationId: 1 });
beatPlanListSchema.index({ organizationId: 1, createdBy: 1 });

// Pre-save hook to calculate totals
beatPlanListSchema.pre('save', function (next) {
    this.totalParties = this.parties?.length || 0;
    this.totalSites = this.sites?.length || 0;
    this.totalProspects = this.prospects?.length || 0;
    this.totalDirectories = this.totalParties + this.totalSites + this.totalProspects;
    next();
});

const BeatPlanList = mongoose.model('BeatPlanList', beatPlanListSchema);

module.exports = BeatPlanList;
