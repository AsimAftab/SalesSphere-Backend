const mongoose = require('mongoose');

/**
 * @desc This model stores a simple counter for each organization to
 * ensure unique, sequential invoice numbers.
 */
const counterSchema = new mongoose.Schema({
    // A unique identifier for what we are counting,
    // in this case, it will be the organizationId
    _id: {
        type: String,
        required: true
    },
    // The last sequence number used
    seq: {
        type: Number,
        default: 0
    }
});

// Helper function to get the next invoice number for an organization
counterSchema.statics.getNextSequenceValue = async function (organizationId) {
    const counter = await this.findByIdAndUpdate(
        organizationId.toString(),
        { $inc: { seq: 1 } },
        { new: true, upsert: true } // 'new: true' returns the modified doc, 'upsert: true' creates it if it doesn't exist
    );
    return counter.seq;
};

const Counter = mongoose.model('Counter', counterSchema);
module.exports = Counter;