const mongoose = require('mongoose');
const { Schema } = mongoose;

const vacateScehma = new Schema({
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
        enum: ['completed', 'withdrawn', 'noticeperiod'],
        default: 'noticeperiod'
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

    previousSnapshot: {
        type: Object,
        default: null
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Vacate', vacateScehma);