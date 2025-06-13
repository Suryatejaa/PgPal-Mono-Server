const express = require('express');
const router = express.Router();
const PropertyController = require('../controllers/propertyController');
const reviewController = require('../controllers/reviewController');
const amenitiesController = require('../controllers/amenitiesController');
const imagesController = require('../controllers/imagesController');
const rulesController = require('../controllers/rulesController');
const { validatePlanAccess } = require('../middleware/planValidates.js');

const cacheMiddleware = require('../utils/cacheMiddleware');

// Test route to verify routing works
router.get('/test-route', (req, res) => {
    res.json({ message: 'Test route works', timestamp: new Date().toISOString() });
});

// Public routes (no plan restrictions)
router.get('/search', cacheMiddleware, PropertyController.searchProperties);
router.get('/properties/nearby', PropertyController.getNearbyProperties);
router.get('/list', cacheMiddleware, PropertyController.getAllProperties);
router.get('/getAllProperties', cacheMiddleware, PropertyController.getAllPropertiesInternal);

// Plan information routes (must be before /:id routes)
router.get('/user/plan-info', validatePlanAccess(), PropertyController.getPlanInfo);
router.get('/user/plan-usage', validatePlanAccess(), PropertyController.getPlanUsage);

// Owner-specific routes with plan restrictions
router.post('/create', validatePlanAccess('add_property'), PropertyController.addProperty);
router.get('/own', cacheMiddleware, validatePlanAccess('basic_management'), PropertyController.getProperties);
router.put('/property/:id', validatePlanAccess('basic_management'), PropertyController.updateProperty);
router.patch('/properties/:id/update-beds', validatePlanAccess('basic_management'), PropertyController.updateTotalBeds);
router.delete('/property/:id', validatePlanAccess('basic_management'), PropertyController.deleteProperty);
router.put('/properties/:id/location', validatePlanAccess('basic_management'), PropertyController.updateLocation);

// Property viewing routes (minimal restrictions) - Use specific prefixes to avoid admin conflicts
router.get('/property/:id', cacheMiddleware, PropertyController.getPropertyById);
router.get('/property-detail/:id', cacheMiddleware, PropertyController.getPropertyForRoom);
router.get('/property-ppid/:ppid', cacheMiddleware, PropertyController.getPropertyByPpid);

// Review routes with plan restrictions
router.get('/property/:id/reviews', cacheMiddleware, validatePlanAccess('view_reviews'), reviewController.getPropertyReviews);
router.post('/property/:id/reviews', validatePlanAccess('view_reviews'), reviewController.addReview);
router.put('/property/:id/reviews/:reviewId', validatePlanAccess('view_reviews'), reviewController.editReview);
router.delete('/property/:id/reviews/:reviewId', validatePlanAccess('view_reviews'), reviewController.deleteReview);

// Amenity routes with plan restrictions
router.get('/property/:id/amenities', cacheMiddleware, amenitiesController.getAmenities);
router.post('/property/:id/amenities', validatePlanAccess('manage_amenities'), amenitiesController.addAmenity);
router.delete('/property/:id/amenities', validatePlanAccess('manage_amenities'), amenitiesController.deleteAmenity);

// Rules routes with plan restrictions
router.post('/property/:id/rules', validatePlanAccess('manage_rules'), rulesController.addRule);
router.get('/property/:id/rules', cacheMiddleware, rulesController.getRules);
router.delete('/property/:id/rules/:ruleId', validatePlanAccess('manage_rules'), rulesController.deleteRule);

// Owner info route
router.get('/property/:id/owner', cacheMiddleware, PropertyController.getOwnerInfo);

// Image routes with plan restrictions
router.post('/property/:id/images', validatePlanAccess('basic_management'), imagesController.uploadImages);
router.delete('/property/:id/images/:imageId', validatePlanAccess('basic_management'), imagesController.deleteImage);
router.get('/property/:id/images', cacheMiddleware, imagesController.getImages);
router.put('/property/:id/images/:imageId', validatePlanAccess('basic_management'), imagesController.updateImage);

// Availability routes
router.get('/property/:id/availability', cacheMiddleware, PropertyController.getAvailability);
router.put('/property/:id/availability', validatePlanAccess('basic_management'), PropertyController.updateAvailability);

// Analytics routes with plan restrictions
router.get('/property/:id/occupancy-trend', cacheMiddleware, validatePlanAccess('analytics'), PropertyController.occupancyTrend);
router.get('/analytics', cacheMiddleware, validatePlanAccess('analytics'), PropertyController.analytics);

module.exports = router;
