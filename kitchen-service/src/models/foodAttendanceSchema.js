const mongoose = require('mongoose');

const foodAttendanceSchema = new mongoose.Schema({
    propertyPpid: { type: String, required: true },
    tenantPpid: { type: String, required: true },
    meal: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    date: { type: Date, required: true },
    confirmed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FoodAttendance', foodAttendanceSchema);