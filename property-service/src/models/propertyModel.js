const mongoose = require('mongoose');
const { generatePPP } = require('../utils/idGenerator'); // Import the ID generator function

const propertySchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    createdBy: { type: String, required: true },
    name: { type: String, required: true },
    contact: {
        type: {
            phone: { type: String },
            email: { type: String },
            website: { type: String }
        },
        validate: {
            validator: function (v) {
                return v.phone || v.email || v.website;
            },
            message: 'At least one contact method (phone, email, or website) must be provided.'
        },
        required: true
    },

    ownerContact: {
        trype: {
            phone: { type: String },
            email: { type: String },
            website: { type: String }
        }
    },

    pgpalId: {
        type: String,
        unique: true,
        default: () => { return generatePPP(); }// Generate a new property ID
    },
    pgGenderType: {
        type: String,
        enum: ['gents', 'ladies', 'colive'],
        required: true
    },
    address: {
        type: {
            plotNumber: { type: String, required: true },
            line1: { type: String },
            line2: { type: String },
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            country: { type: String, required: true },
            zipCode: { type: String, required: true }
        },
        required: true
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true,
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        }
      },

    totalRooms: { type: Number, required: true },
    totalBeds: { type: Number, required: true },
    availableBeds: { type: Number, required: true },
    occupiedBeds: { type: Number, required: true },
   
    amenities: [
        {
            type: String,
            default: [] // corrected the syntax for default
        },
    ],

    roomsDenominator: { type: String, enum: ['Single', 'Double', 'Tripple', 'Quad'] },
    views: { type: Number, default: 0 },

    images: [{
        url: { type: String, required: true },
        description: { type: String }
    }],

   

    // availability: {
    //     type: {
    //         startDate: { type: Date, required: true },
    //         endDate: { type: Date, required: true }
    //     },
    //     required: true
    // },

    createdAt: {
        type: Date,
        default: Date.now
    },

}, { timestamps: true });

propertySchema.index({ location: '2dsphere' });

propertySchema.pre('save', async function (next) {
    if (this.pgpalId) {
        const uniqueId = await this.model('Property').findOne({ pgpalId: this.pgpalId });
        while (uniqueId) {
            let newId = generatePPP(); // Generate a new property ID
            this.pgpalId = newId; // Assign the new ID to pgpalId
            uniqueId = await this.model('Property').findOne({ pgpalId: this.pgpalId });
        }
    }
})

module.exports = mongoose.model('Property', propertySchema);
