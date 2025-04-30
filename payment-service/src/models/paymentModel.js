const mongoose = require('mongoose');
const { Schema } = mongoose;

const rentPaymentSchema = new Schema({
    tenantPpid: { type: String, required: true },
    propertyPpid: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    method: { type: String, enum: ['upi', 'cash', 'bank'], default: 'upi' },
    transactionId: { type: String, default: null },
    paidDate: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RentPayment', rentPaymentSchema);
