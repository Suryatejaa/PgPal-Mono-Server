// src/utils/planHelper.js
const { PLAN_LIMITS } = require('../middleware/planValidates.js');

class PlanHelper {
    static getUserPlan(currentUser) {
        const userPlan = currentUser?.data?.user?.currentPlan || { type: 'free' };
        const planType = userPlan.type || 'free';
        const planLimits = PLAN_LIMITS[planType];

        return {
            type: planType,
            limits: planLimits,
            ...userPlan
        };
    }

    static hasFeature(userPlan, feature) {
        return userPlan.limits.features.includes(feature) || userPlan.limits.features.includes('all_features');
    }

    static hasRestriction(userPlan, restriction) {
        return userPlan.limits.restrictions.includes(restriction);
    }

    static checkResourceLimit(userPlan, resourceType, currentCount) {
        const limitKey = `max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`;
        const limit = userPlan.limits[limitKey];

        if (limit === -1) return { allowed: true }; // unlimited

        return {
            allowed: currentCount < limit,
            limit,
            currentCount,
            remaining: Math.max(0, limit - currentCount)
        };
    }

    static createUpgradeResponse(planType, feature, currentCount = null, maxAllowed = null) {
        return {
            error: currentCount !== null
                ? `Resource limit reached. Your ${planType} plan allows ${maxAllowed} items.`
                : `This feature requires a higher plan than ${planType}`,
            currentPlan: planType,
            upgradeRequired: true,
            suggestedPlan: this.getSuggestedPlanForFeature(feature),
            ...(currentCount !== null && { currentCount, maxAllowed })
        };
    }

    static getSuggestedPlanForFeature(feature) {
        const plans = ['free', 'trial', 'starter', 'professional'];

        for (const plan of plans) {
            const limits = PLAN_LIMITS[plan];
            if (limits.features.includes(feature) || limits.features.includes('all_features')) {
                return plan;
            }
        }
        return 'professional';
    }

    static getPlanSummary(userPlan) {
        const limits = userPlan.limits;
        return {
            planType: userPlan.type,
            properties: {
                max: limits.maxProperties,
                unlimited: limits.maxProperties === -1
            },
            roomsPerProperty: {
                max: limits.maxRoomsPerProperty,
                unlimited: limits.maxRoomsPerProperty === -1
            },
            bedsPerProperty: {
                max: limits.maxBedsPerProperty,
                unlimited: limits.maxBedsPerProperty === -1
            },
            imagesPerProperty: {
                max: limits.maxImagesPerProperty,
                unlimited: limits.maxImagesPerProperty === -1
            },
            reviewsDisplayed: {
                max: limits.maxReviewsDisplayed,
                unlimited: limits.maxReviewsDisplayed === -1
            },
            features: limits.features,
            restrictions: limits.restrictions
        };
    }
}

module.exports = PlanHelper;
