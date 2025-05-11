const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    updatedBy: String,
    updatedByName: String,
    updatedByRole: { type: String, enum: ['owner', 'tenant'] }
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);
