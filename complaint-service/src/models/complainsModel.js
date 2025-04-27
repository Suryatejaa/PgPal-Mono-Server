const mongoose = require('mongoose');
const { Schema } = mongoose;

const complaintsMap = {
    Electrical: {
        name: 'Electrical',
        responseTime: '24 hours',
        priority: 'High',
    },
    Plumbing: {
        name: 'Plumbing',
        responseTime: '24 hours',
        priority: 'High',
    },
    Maintenance: {
        name: 'Maintenance',
        responseTime: '48 hours',
        priority: 'Medium',
    },
    Internet: {
        name: 'Internet',
        responseTime: '24 hours',
        priority: 'High',
    },
    Furniture: {
        name: 'Furniture',
        responseTime: '48 hours',
        priority: 'Medium',
    },
    Food: {
        name: 'Food',
        responseTime: '24 hours',
        priority: 'Medium',
    },
    Other: {
        name: 'Other',
        responseTime: 'N/A',
        priority: 'Low',
    }
};

const complaintSchema = new Schema({
    complaintId: {
        type: String,
        required: true,
        unique: true
    },
    tenantId: {
        type: String,
        required: true
    },
    propertyId: {
        type: String,
        required: true
    },
    complaintOn: {
        type: String,
        required: true
    },
    complaintType: {
        type: String,
        enum: Object.keys(complaintsMap),
        default: 'Other',
        required: true
    },
    complaintMetadata: {
        type: Object,
        default: () => complaintsMap['Other']
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Resolved', 'Closed','In Progress', 'Rejected'],
        default: 'Pending'
    },
    notes: [
        {
            message: String,
            by: String,
            at: { type: Date, default: Date.now }
        }
    ],
    resolvedBy: {
        type: String,
        default: ''
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: String,
        required: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
});



module.exports = mongoose.model('Complaint', complaintSchema);
