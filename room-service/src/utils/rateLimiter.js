const rateLimit = require('express-rate-limit');
const adminConfig = require('../config/adminConfig');

// Create rate limiters for different endpoint types
const createRateLimiter = (type) => {
    const config = adminConfig.rateLimits[type];
    if (!config) {
        throw new Error(`Rate limit configuration not found for type: ${type}`);
    }

    return rateLimit({
        windowMs: config.windowMs,
        max: config.max,
        message: {
            error: `Too many requests. Maximum ${config.max} requests per ${config.windowMs / 1000} seconds allowed.`,
            retryAfter: Math.ceil(config.windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            // Use user ID if available, otherwise fall back to IP
            const user = req.user || {};
            return user._id || req.ip;
        },
        skip: (req) => {
            // Skip rate limiting for superadmin in development
            if (process.env.NODE_ENV === 'development' && req.user?.role === 'superadmin') {
                return true;
            }
            return false;
        }
    });
};

// Pre-configured rate limiters
const rateLimiters = {
    dashboard: createRateLimiter('dashboard'),
    analytics: createRateLimiter('analytics'),
    bulkOperations: createRateLimiter('bulkOperations'),
    exports: createRateLimiter('exports')
};

// Custom rate limiter that adapts based on endpoint
const adaptiveRateLimit = (req, res, next) => {
    const path = req.path.toLowerCase();

    let limiterType = 'dashboard'; // default

    if (path.includes('/analytics')) {
        limiterType = 'analytics';
    } else if (path.includes('/bulk') || path.includes('/export')) {
        limiterType = 'exports';
    } else if (path.includes('/rooms') && req.method !== 'GET') {
        limiterType = 'bulkOperations';
    }

    const limiter = rateLimiters[limiterType];
    return limiter(req, res, next);
};

module.exports = {
    rateLimiters,
    adaptiveRateLimit,
    createRateLimiter
};
