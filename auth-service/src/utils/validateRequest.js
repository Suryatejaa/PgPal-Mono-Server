const User = require('../models/userModel');
const { check, validationResult } = require('express-validator');
const validateRequest = [
    check('username', 'Username is required').notEmpty(),
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

const updateUserValidation = [
    check('email').optional().isEmail().withMessage('Invalid email'),
    check('phoneNumber').optional().isMobilePhone().withMessage('Invalid phone number'),
    check('gender').optional().notEmpty().withMessage('Gender is required'),
    check('role').optional().notEmpty().withMessage('Role is required'),
    check('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    // ...add other fields as needed
];

module.exports = {
    validateRequest,
    updateUserValidation
};
