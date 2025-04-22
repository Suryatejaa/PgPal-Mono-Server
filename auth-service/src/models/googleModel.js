// filepath: c:\Users\illas\Downloads\PgPalManager\PgPalManager\PGserver\auth-service\src\models\googleUserModel.js
const mongoose = require('mongoose');

const googleUserSchema = new mongoose.Schema({
    googleId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    refreshToken: { type: String },
    role: { type: String }, // Add role field
    phoneNumber: { type: String }, // Add phone number field
    isVerified: { type: Boolean, default: true },
});

module.exports = mongoose.model('GoogleUser', googleUserSchema);