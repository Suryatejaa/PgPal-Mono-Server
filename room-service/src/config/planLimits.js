// src/config/planLimits.js
const PLAN_LIMITS = {
    free: {
        maxProperties: 1,
        maxRoomsPerProperty: 4,
        maxBedsPerProperty: 10,
        maxImagesPerProperty: 5,
        maxReviewsDisplayed: 10,
        features: ['add_property', 'basic_management', 'basic_notifications', 'view_reviews'],
        restrictions: ['no_analytics', 'no_bulk_operations', 'no_advanced_search', 'no_amenity_management']
    },
    trial: {
        maxProperties: 2,
        maxRoomsPerProperty: 12,
        maxBedsPerProperty: 25,
        maxImagesPerProperty: 10,
        maxReviewsDisplayed: 25,
        features: ['add_property', 'basic_management', 'basic_notifications', 'basic_analytics', 'view_reviews', 'manage_amenities'],
        restrictions: ['no_bulk_operations', 'no_advanced_notifications', 'no_advanced_search'],
        trialDays: 30
    },
    starter: {
        maxProperties: 5,
        maxRoomsPerProperty: 24,
        maxBedsPerProperty: 70,
        maxImagesPerProperty: 20,
        maxReviewsDisplayed: 50,
        features: ['add_property', 'basic_management', 'notifications', 'analytics', 'tenant_management', 'view_reviews', 'manage_amenities', 'manage_rules', 'advanced_search'],
        restrictions: ['limited_bulk_operations']
    },
    professional: {
        maxProperties: -1, // unlimited
        maxRoomsPerProperty: -1, // unlimited
        maxBedsPerProperty: -1, // unlimited
        maxImagesPerProperty: -1, // unlimited
        maxReviewsDisplayed: -1, // unlimited
        features: ['all_features'],
        restrictions: []
    }
}; 

module.exports = PLAN_LIMITS;