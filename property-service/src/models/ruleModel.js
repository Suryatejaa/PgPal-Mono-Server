const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    rule: { type: String, required: true },
    normalizedRule: { type: String, required: true, unique: true }, // Add normalizedRule field
    updatedBy: { type: String, required: true },
    updatedByName: { type: String, required: true },
    updatedByRole: { type: String, enum: ['owner', 'tenant'] },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Rule', RuleSchema);
