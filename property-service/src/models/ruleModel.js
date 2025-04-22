const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    rule: String,
    updatedBy: String,
    updatedByName: String,
    updatedByRole: { type: String, enum: ['owner', 'user'] }
}, { timestamps: true });

module.exports = mongoose.model('Rule', RuleSchema);
