const mongoose = require('mongoose');
const { Schema } = mongoose;

const tenantSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        sparse:true
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
        roomPpid: { type: String },
        rent: { type: Number },
        bedId: { type: String },
        assignedAt: { type: Date, default: Date.now }
    },
    
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    stayHistory: [
        {
            propertyId: mongoose.Schema.Types.ObjectId,
            roomId: mongoose.Schema.Types.ObjectId,
            bedId: String,
            from: Date,
            to: Date
        }
    ],
    createdBy: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

module.exports = mongoose.model('Tenant', tenantSchema);