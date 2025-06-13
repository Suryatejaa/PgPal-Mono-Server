// src/middleware/planValidation.js
const PLAN_LIMITS = require('../config/planLimits');

const validatePlanAccess = (requiredFeature = null) => {
    return async (req, res, next) => {
        const isInternalService = req.headers['x-internal-service'] === 'true' ||
            req.headers['x-service-name'] ||
            req.headers['x-api-key'];

        if (isInternalService) {
            return next(); // Skip plan validation for internal calls
        }
        const currentUser = JSON.parse(req.headers['x-user']) || {};

        if (!currentUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userPlan = currentUser.data.user.currentPlan || { type: 'free' };
        const planType = userPlan.type || 'free';
        const planLimits = PLAN_LIMITS[planType];

        if (!planLimits) {
            return res.status(400).json({ error: 'Invalid plan type' });
        }

        // Check if feature is allowed for this plan
        if (requiredFeature && !planLimits.features.includes(requiredFeature) && !planLimits.features.includes('all_features')) {
            return res.status(403).json({
                error: `This feature requires ${getMinimumPlanForFeature(requiredFeature)} plan or higher`,
                currentPlan: planType,
                upgradeRequired: true,
                requiredFeature,
                suggestedPlan: getMinimumPlanForFeature(requiredFeature)
            });
        }

        // Attach plan info to request
        req.userPlan = {
            type: planType,
            limits: planLimits,
            ...userPlan
        };

        next();
    };
};

const validateResourceLimit = (resourceType, currentCount) => {
    return (req, res, next) => {
        if (!req.userPlan) {
            return res.status(400).json({ error: 'Plan validation required before resource limit check' });
        }

        const limit = req.userPlan.limits[`max${resourceType}`];

        if (limit !== -1 && currentCount >= limit) {
            return res.status(403).json({
                error: `${resourceType} limit reached. Your ${req.userPlan.type} plan allows ${limit} ${resourceType.toLowerCase()}.`,
                currentCount,
                maxAllowed: limit,
                upgradeRequired: true,
                suggestedPlan: getSuggestedPlanForLimit(resourceType, currentCount + 1)
            });
        }

        next();
    };
};

const validateBulkOperation = (maxItems = 10) => {
    return (req, res, next) => {
        if (!req.userPlan) {
            return res.status(400).json({ error: 'Plan validation required before bulk operation check' });
        }

        const planType = req.userPlan.type;
        const restrictions = req.userPlan.limits.restrictions || [];

        if (restrictions.includes('no_bulk_operations')) {
            return res.status(403).json({
                error: `Bulk operations are not available on your ${planType} plan`,
                upgradeRequired: true,
                suggestedPlan: 'starter'
            });
        }

        if (restrictions.includes('limited_bulk_operations')) {
            const itemCount = req.body.items ? req.body.items.length : 1;
            if (itemCount > maxItems) {
                return res.status(403).json({
                    error: `Bulk operation limit exceeded. Your ${planType} plan allows up to ${maxItems} items per operation`,
                    currentCount: itemCount,
                    maxAllowed: maxItems,
                    upgradeRequired: true,
                    suggestedPlan: 'professional'
                });
            }
        }

        next();
    };
};

const validateAdvancedSearch = () => {
    return (req, res, next) => {
        if (!req.userPlan) {
            return res.status(400).json({ error: 'Plan validation required before advanced search' });
        }

        const planType = req.userPlan.type;
        const restrictions = req.userPlan.limits.restrictions || [];

        if (restrictions.includes('no_advanced_search')) {
            return res.status(403).json({
                error: `Advanced search features are not available on your ${planType} plan`,
                upgradeRequired: true,
                suggestedPlan: 'starter'
            });
        }

        next();
    };
};

const getSuggestedPlan = (resourceCount) => {
    const plans = ['free', 'trial', 'starter', 'professional'];

    for (const plan of plans) {
        const limits = PLAN_LIMITS[plan];
        if (limits.maxProperties === -1 || limits.maxProperties >= resourceCount) {
            return plan;
        }
    }
    return 'professional';
};

const getSuggestedPlanForLimit = (resourceType, requiredCount) => {
    const plans = ['free', 'trial', 'starter', 'professional'];
    const limitKey = `max${resourceType}`;

    for (const plan of plans) {
        const limits = PLAN_LIMITS[plan];
        if (limits[limitKey] === -1 || limits[limitKey] >= requiredCount) {
            return plan;
        }
    }
    return 'professional';
};

const getMinimumPlanForFeature = (feature) => {
    const plans = ['free', 'trial', 'starter', 'professional'];

    for (const plan of plans) {
        if (PLAN_LIMITS[plan].features.includes(feature) || PLAN_LIMITS[plan].features.includes('all_features')) {
            return plan;
        }
    }
    return 'professional';
};

const checkPlanFeature = (feature, userPlan) => {
    const planLimits = PLAN_LIMITS[userPlan.type];
    return planLimits.features.includes(feature) || planLimits.features.includes('all_features');
};

module.exports = {
    validatePlanAccess,
    validateResourceLimit,
    validateBulkOperation,
    validateAdvancedSearch,
    getSuggestedPlan,
    getSuggestedPlanForLimit,
    getMinimumPlanForFeature,
    checkPlanFeature,
    PLAN_LIMITS
};