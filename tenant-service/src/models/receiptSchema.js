const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
    receiptNumber: { type: String, required: true, unique: true },
    tenantPpid: { type: String, required: true },
    propertyPpid: { type: String, required: true },
    rentPaid: { type: Number, required: true },
    rentPaidDate: { type: Date, required: true },
    pdfContent: { type: Buffer, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Receipt', receiptSchema);