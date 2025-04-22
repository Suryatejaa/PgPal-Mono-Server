const User = require('../models/userModel');
const { check, validationResult } = require('express-validator');
const validateRequest = [
    check('username', 'Username is required').notEmpty(),
    // check('username', 'Username already exists').custom(async (value) => {
    //     const existingUser = await User.findOne({ username: value });
    //     if (existingUser) {
    //         throw new Error('Username already exists');
    //     }
    // }),
    check('email', 'Email is required').notEmpty(),
    check('email', 'Invalid email').isEmail(),
    check('email', 'Email already exists').custom(async (value) => {
        const existingUser = await User.findOne({ email: value });
        if (existingUser) {
            throw new Error('Email already exists');
        }
    }),
    check('phoneNumber', 'Phone Number is required').notEmpty(),
    check('phoneNumber', 'Invalid phone number')
        .isMobilePhone('en-IN')
        .matches(/^\d{10}$/),
    check('phoneNumber', 'Phone Number already exists').custom(async (value) => {
        const existingUser = await User.findOne({ phoneNumber: value });
        if (existingUser) {
            throw new Error('Phone Number already exists');
        }
    }),
    check('gender', 'Gender is required').notEmpty(),
    check('role', 'Role is required').notEmpty(),
    check('password', 'Password is required').notEmpty(),
    check('password', 'Password must be at least 8 characters').isLength({ min: 8 }),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];
module.exports = validateRequest;
