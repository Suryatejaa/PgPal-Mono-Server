const Joi = require('joi');
const mongoose = require('mongoose');

// Custom validation schemas for admin endpoints
const adminValidationSchemas = {
    // Pagination validation
    pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
    }),

    // Time frame validation
    timeframe: Joi.string().valid('7d', '30d', '90d', '1y').default('30d'),

    // Room search validation
    roomSearch: Joi.object({
        search: Joi.string().min(1).max(100).optional(),
        propertyId: Joi.string().custom((value, helpers) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                return helpers.error('any.invalid');
            }
            return value;
        }).optional(),
        status: Joi.string().valid('vacant', 'partially occupied', 'occupied').optional(),
        type: Joi.string().valid('single', 'double', 'triple', 'four', 'five', 'six', 'seven', 'eight').optional(),
        floor: Joi.number().integer().min(0).max(50).optional(),
        minRent: Joi.number().min(0).optional(),
        maxRent: Joi.number().min(0).optional(),
        bedStatus: Joi.string().valid('vacant', 'occupied', 'noticeperiod').optional(),
        sortBy: Joi.string().valid('createdAt', 'updatedAt', 'roomNumber', 'rentPerBed', 'totalBeds').default('createdAt'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    }).and('minRent', 'maxRent'), // If one is provided, both should be provided

    // Bulk update validation
    bulkUpdate: Joi.object({
        roomIds: Joi.array().items(
            Joi.string().custom((value, helpers) => {
                if (!mongoose.Types.ObjectId.isValid(value)) {
                    return helpers.error('any.invalid');
                }
                return value;
            })
        ).min(1).max(50).required(),
        updates: Joi.object({
            status: Joi.string().valid('vacant', 'partially occupied', 'occupied').optional(),
            rentPerBed: Joi.number().min(0).max(100000).optional(),
            type: Joi.string().valid('single', 'double', 'triple', 'four', 'five', 'six', 'seven', 'eight').optional(),
            floor: Joi.number().integer().min(0).max(50).optional()
        }).min(1).required()
    }),

    // Analytics validation
    analytics: Joi.object({
        groupBy: Joi.string().valid('property', 'type', 'floor', 'date').default('property'),
        timeframe: Joi.string().valid('7d', '30d', '90d', '1y').default('30d'),
        metrics: Joi.array().items(
            Joi.string().valid('occupancy', 'revenue', 'growth')
        ).default(['occupancy', 'revenue'])
    }),

    // Export validation
    export: Joi.object({
        format: Joi.string().valid('json', 'csv').default('json'),
        type: Joi.string().valid('rooms', 'analytics', 'logs', 'all').default('all'),
        dateRange: Joi.object({
            start: Joi.date().iso().optional(),
            end: Joi.date().iso().min(Joi.ref('start')).optional()
        }).optional()
    }),

    // Activity logs validation
    activityLogs: Joi.object({
        userId: Joi.string().custom((value, helpers) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                return helpers.error('any.invalid');
            }
            return value;
        }).optional(),
        action: Joi.string().min(1).max(200).optional(),
        resource: Joi.string().valid('room', 'property', 'user', 'analytics', 'dashboard', 'system', 'other').optional(),
        status: Joi.string().valid('success', 'error', 'warning').optional(),
        timeframe: Joi.string().valid('7d', '30d', '90d').default('7d')
    })
};

// Validation middleware factory
const createValidationMiddleware = (schemaName, source = 'query') => {
    return (req, res, next) => {
        const schema = adminValidationSchemas[schemaName];
        if (!schema) {
            return res.status(500).json({ error: 'Validation schema not found' });
        }

        const dataToValidate = source === 'body' ? req.body :
            source === 'params' ? req.params :
                req.query;

        const { error, value } = schema.validate(dataToValidate, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
        });

        if (error) {
            const errorDetails = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            return res.status(400).json({
                error: 'Validation failed',
                details: errorDetails
            });
        }

        // Attach validated data back to request
        if (source === 'body') {
            req.body = value;
        } else if (source === 'params') {
            req.params = value;
        } else {
            req.query = value;
        }

        next();
    };
};

// Composite validation for endpoints that need multiple validations
const validatePagination = createValidationMiddleware('pagination', 'query');
const validateRoomSearch = createValidationMiddleware('roomSearch', 'query');
const validateBulkUpdate = createValidationMiddleware('bulkUpdate', 'body');
const validateAnalytics = createValidationMiddleware('analytics', 'query');
const validateExport = createValidationMiddleware('export', 'query');
const validateActivityLogs = createValidationMiddleware('activityLogs', 'query');

// Custom validators
const customValidators = {
    // Validate ObjectId
    isValidObjectId: (value) => {
        return mongoose.Types.ObjectId.isValid(value);
    },

    // Validate date range
    isValidDateRange: (start, end) => {
        if (!start || !end) return true; // Optional fields
        const startDate = new Date(start);
        const endDate = new Date(end);
        return startDate <= endDate && endDate <= new Date();
    },

    // Validate rent range
    isValidRentRange: (min, max) => {
        if (min === undefined && max === undefined) return true;
        if (min !== undefined && max !== undefined) {
            return min <= max && min >= 0 && max >= 0;
        }
        return (min >= 0) || (max >= 0);
    },

    // Validate array of ObjectIds
    areValidObjectIds: (ids) => {
        if (!Array.isArray(ids)) return false;
        return ids.every(id => mongoose.Types.ObjectId.isValid(id));
    }
};

// Error formatter for validation errors
const formatValidationError = (error) => {
    if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => ({
            field: err.path,
            message: err.message,
            value: err.value
        }));
        return {
            error: 'Validation failed',
            details: errors
        };
    }
    return {
        error: 'Validation failed',
        message: error.message
    };
};

// Sanitization helpers
const sanitizers = {
    // Remove HTML tags and dangerous characters
    sanitizeString: (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/[<>]/g, '')
            .trim();
    },

    // Sanitize search query
    sanitizeSearchQuery: (query) => {
        if (!query) return query;
        return query.replace(/[^\w\s-_.]/g, '').trim();
    },

    // Sanitize numeric values
    sanitizeNumber: (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const num = parseInt(value);
        if (isNaN(num)) return undefined;
        return Math.max(min, Math.min(max, num));
    }
};

module.exports = {
    adminValidationSchemas,
    createValidationMiddleware,
    validatePagination,
    validateRoomSearch,
    validateBulkUpdate,
    validateAnalytics,
    validateExport,
    validateActivityLogs,
    customValidators,
    formatValidationError,
    sanitizers
};
