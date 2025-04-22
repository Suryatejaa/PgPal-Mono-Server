const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    url: String,
    description: String
}, { timestamps: true }); const mongoose = require('mongoose');

module.exports = mongoose.model('Image', ImageSchema);

