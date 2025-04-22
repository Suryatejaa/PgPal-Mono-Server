// filepath: c:\Users\illas\Downloads\PgPalManager\PgPalManager\PGserver\auth-service\src\routes\authRoutes.js
const express = require('express');
const authenticate = require('../utils/authenticate');
const GoogleUser = require('../models/googleModel');

const router = express.Router();

// Update user profile
const updateProfileGoogle = async (req, res) => {
    try {
        const { role, phoneNumber } = req.body;

        // Validate input
        if (!role || !phoneNumber) {
            return res.status(400).json({ message: 'Role and phone number are required' });
        }

        // Update the Google user
        const user = await GoogleUser.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.role = role;
        user.phoneNumber = phoneNumber;
        await user.save();

        res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update profile', error: error.message });
    }
};

module.exports = updateProfileGoogle;