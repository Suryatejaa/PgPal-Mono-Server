const { check, validationResult } = require('express-validator');
const User = require('../models/userModel');
const { suspendUser } = require('../controllers/adminController');

/**
 * Validation for creating admin user
 */
const validateAdminCreation = [
    check('username', 'Username is required').notEmpty(),
    check('username', 'Username must be at least 3 characters').isLength({ min: 3 }),
    check('username', 'Username already exists').custom(async (value) => {
        const existingUser = await User.findOne({ username: value.toLowerCase() });
        if (existingUser) {
            throw new Error('Username already exists');
        }
    }),

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

    check('password', 'Password is required').notEmpty(),
    check('password', 'Password must be at least 8 characters').isLength({ min: 8 }),
    check('password', 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/),

    check('gender', 'Gender is required').notEmpty(),
    check('gender', 'Invalid gender').isIn(['male', 'female', 'other']),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

/**
 * Validation for bulk user operations
 */
const validateBulkOperation = [
    check('operation', 'Operation is required').notEmpty(),
    check('operation', 'Invalid operation').isIn([
        'verify', 'unverify', 'delete', 'suspend', 'unsuspend', 'update_subscription'
    ]),
    check('userIds', 'User IDs array is required').isArray({ min: 1 }),
    check('userIds.*', 'Invalid user ID format').isMongoId(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

/**
 * Validation for bulk notification
 */
const validateBulkNotification = [
    check('title', 'Title is required').notEmpty(),
    check('title', 'Title must be at least 3 characters').isLength({ min: 3 }),
    check('message', 'Message is required').notEmpty(),
    check('message', 'Message must be at least 10 characters').isLength({ min: 10 }),
    check('audience', 'Audience is required').notEmpty(),
    check('audience', 'Invalid audience').isIn(['all', 'owners', 'tenants', 'specific']),
    check('type', 'Invalid notification type').optional().isIn(['info', 'warning', 'error', 'success', 'alert']),
    check('method', 'Invalid notification method').optional().isArray(),

    // Conditional validation for specific audience
    check('userIds').if(check('audience').equals('specific')).isArray({ min: 1 }),
    check('userIds.*').if(check('audience').equals('specific')).isMongoId(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

/**
 * Validation for cache management
 */
const validateCacheManagement = [
    check('action', 'Action is required').notEmpty(),
    check('action', 'Invalid action').isIn([
        'clear_all', 'clear_pattern', 'clear_user_caches', 'clear_stats'
    ]),

    // Pattern is required for clear_pattern action
    check('pattern').if(check('action').equals('clear_pattern')).notEmpty(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

/**
 * Validation for user updates by admin
 */
const validateAdminUserUpdate = [
    check('email').optional().isEmail().withMessage('Invalid email'),
    check('phoneNumber').optional().isMobilePhone().withMessage('Invalid phone number'),
    check('gender').optional().isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
    check('role').optional().isIn(['owner', 'tenant', 'admin']).withMessage('Invalid role'),
    check('isVerified').optional().isBoolean().withMessage('isVerified must be boolean'),
    check('isInTrialPeriod').optional().isBoolean().withMessage('isInTrialPeriod must be boolean'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

/**
 * Validation for pagination parameters
 */
const validatePagination = [
    check('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    check('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    check('sortBy').optional().isIn([
        'createdAt', 'updatedAt', 'username', 'email', 'role', 'isVerified'
    ]).withMessage('Invalid sort field'),
    check('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

/**
 * Validation for user search and filters
 */
const validateUserFilters = [
    check('role').optional().isIn(['owner', 'tenant', 'admin']).withMessage('Invalid role filter'),
    check('verified').optional().isBoolean().withMessage('Verified filter must be boolean'),
    check('subscriptionStatus').optional().isIn([
        'active', 'inactive', 'cancelled', 'expired'
    ]).withMessage('Invalid subscription status filter'),
    check('search').optional().isLength({ min: 2 }).withMessage('Search term must be at least 2 characters'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        next();
    }
];

/**
 * Generic error handler for validation
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

module.exports = {
    validateAdminCreation,
    validateBulkOperation,
    validateBulkNotification,
    validateCacheManagement,
    validateAdminUserUpdate,
    validatePagination,
    validateUserFilters,
    handleValidationErrors
};
