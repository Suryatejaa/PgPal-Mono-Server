const mongoose = require('mongoose');
const {generatePPR} = require('../utils/idGenerator'); // Import the ID generator function

const RoomSchema = new mongoose.Schema({
    propertyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roomNumber: { type: Number, required: true }, 
    floor: { type: Number, required: true }, 
    type: { type: String, enum: ['single', 'double', 'triple', 'four', 'five', 'six', 'seven', 'eight'], required: true },
    totalBeds: { type: Number, required: true },
    rentPerBed: { type: Number, required: true },
    beds: [
        {
            bedId: { type: String, required: true },
            status: { type: String, enum: ['vacant', 'occupied'], required: true },
            tenantNo: { type: String, default: null },
            tenantPpt: { type: String, default: null },
        }
    ],
    pgpalId: { 
        type: String,
        unique: true,
        default: function() { return generatePPR(); } // Generate a new property ID
    },
    status: { type: String, enum: ['vacant', 'partially occupied', 'occupied'], default: 'vacant' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

RoomSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

RoomSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

RoomSchema.pre('save', async function (next) {
    if (this.pgpaalId) {
        const uniqueId = await this.model('Room').findOne({ pgpaalId: this.pgpaalId });
        while (uniqueId) {
            let newId = generatePPR(); // Generate a new property ID
            this.pgpaalId = newId; // Assign the new ID to pgpalId
            uniqueId = await this.model('Room').findOne({ pgpaalId: this.pgpaalId });
        }
    }
})

module.exports = mongoose.model('Room', RoomSchema);