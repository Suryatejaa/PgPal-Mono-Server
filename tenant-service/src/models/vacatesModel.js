const mongoose = require('mongoose');
const { Schema } = mongoose;

const vacateScehma = new Schema({
    name: {
        type: String,
        required: true,
    },
    tenantId: {
        type: String,
        required: true,
    },
    propertyId: {
        type: String,
        required: true,
    },
    roomId: {
        type: String,
        required: true,
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
    bedId: {
        type: String,
        required: true,
    },
    vacateRaisedAt: {
        type: Date,
        default: Date.now
    },
    isImmediateVacate: {
        type: Boolean,
        default: false
    },
    isDeppositRefunded: {
        type: Boolean,
        default: false
    },
    vacateDate: {
        type: Date,
        default: vacateDate => {
            if (vacateDate.isImmediateVacate) {
                return Date.now();
            }
            return new Date(Date.now() + (vacateDate.noticePeriodInMonths * 30 * 24 * 60 * 60 * 1000));
        }
    },
    noticePeriodStartDate: {
        type: Date,
        default: null
    },
    noticePeriodEndDate: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['completed', 'withdrawn', 'noticeperiod', 'pending_owner_approval', 'rejected'],
        default: 'noticeperiod'
    },
    withdrawWindow: {
        type: Date,
        default: null
    },
    reason: {
        type: String,
        default: null
    },
    createdBy: {
        type: String
    },
    removedByOwner: {
        type: Boolean,
        default: false
    },
    tenantDepositInfo: {
        type: String,
        default: null
    },
    ownerDepositInfo: {
        type: String,
        default: null
    },
    previousSnapshot: {
        type: Object,
        default: null
    },
    approvedByOwnerAt: {
        type: Date,
        default: null
    },
    approvedBy: {
        type: String,
        default: null
    },
    rejectedByOwnerAt: { type: Date, default: null },
    rejectedBy: { type: String, default: null },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Vacate', vacateScehma);