// Quick test to isolate the validation issue
const Joi = require('joi');
const mongoose = require('mongoose');

console.log('✅ Joi loaded');
console.log('✅ Mongoose loaded');

// Test the analytics schema specifically
const analytics = Joi.object({
    groupBy: Joi.string().valid('property', 'type', 'floor', 'date').default('property'),
    timeframe: Joi.string().valid('7d', '30d', '90d', '1y').default('30d'),
    metrics: Joi.array().items(
        Joi.string().valid('occupancy', 'revenue', 'growth')
    ).default(['occupancy', 'revenue'])
});

console.log('✅ Analytics schema created');

// Test validation middleware factory
const createValidationMiddleware = (schema, source = 'query') => {
    return (req, res, next) => {
        console.log('Validation middleware called');
        next();
    };
};

const validateAnalytics = createValidationMiddleware(analytics, 'query');
console.log('✅ validateAnalytics created, type:', typeof validateAnalytics);

console.log('Test completed successfully');
