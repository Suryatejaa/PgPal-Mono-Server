const mongoose = require('mongoose');
const { Schema } = mongoose;

const tenantSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        sparse: true
    },
    pgpalId: {
        type: String,
        unique: true,
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other']
    },
    phone: {
        type: String,
        required: true,
        unique: true,
    },
    aadhar: {
        type: String,
        required: true,
        unique: true,
    },
    address: {
        type: String
    },
    currentStay: {
        propertyPpid: { type: String },
        propertyName: { type: String },
        roomPpid: { type: String },
        rent: { type: Number },
        rentPaid: { type: Number },
        rentDue: { type: Number },
        rentPaidDate: { type: Date },
        rentDueDate: { type: Date },
        rentPaidStatus: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
        rentPaidMethod: { type: String, enum: ['upi', 'cash', 'bank'], default: 'upi' },
        rentPaidTransactionId: { type: String },
        nextRentDueDate: { type: Date },
        deposit: { type: Number },
        advanceBalance: {
            type: Number,
            default: 0
        },
        bedId: { type: String },
        assignedAt: { type: Date, default: Date.now },
        noticePeriodInMonths: { type: Number, default: 1 },
        isInNoticePeriod: { type: Boolean, default: false }
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    stayHistory: [
        {
            propertyId: String,
            roomId: String,
            bedId: String,
            from: Date,
            to: Date
        }
    ],
    isInNoticePeriod: {
        type: Boolean,
        default: false
    },
    noticePeriodStartDate: {
        type: Date,
        default: null
    },
    noticePeriodEndDate: {
        type: Date,
        default: null
    },
    createdBy: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

module.exports = mongoose.model('Tenant', tenantSchema);