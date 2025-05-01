const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
    tenantId: { type: String, required: true },
    propertyPpid: { type: String, required: true },
    type: {
        type: String,
        enum: ['info', 'alert', 'reminder', 'complaint_update', 'manual'],
        default: 'info'
    },
    method: {
        type: [String],
        enum: ['in-app', 'email', 'sms'],
        default: ['in-app']
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
    },
    isRead: { type: Boolean, default: false },
    createdBy: { type: String }, // owner/admin ID
    sentAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
