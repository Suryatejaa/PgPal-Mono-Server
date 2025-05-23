const express = require('express');
const router = express.Router();
const PropertyController = require('../controllers/propertyController');
const reviewController = require('../controllers/reviewController');
const amenitiesController = require('../controllers/amenitiesController');
const imagesController = require('../controllers/imagesController');
const rulesController = require('../controllers/rulesController');

const cacheMiddleware = require('../utils/cacheMiddleware')


router.post('/', PropertyController.addProperty);
router.get('/', cacheMiddleware, PropertyController.getAllProperties);
router.get('/own', cacheMiddleware, PropertyController.getProperties);
router.get('/search', cacheMiddleware, PropertyController.searchProperties);
router.get('/:id', cacheMiddleware, PropertyController.getPropertyById);
router.get('/property/:id', cacheMiddleware, PropertyController.getPropertyForRoom);
router.get('/property-ppid/:ppid', cacheMiddleware, PropertyController.getPropertyByPpid);
router.put('/:id', PropertyController.updateProperty);
router.patch('/properties/:id/update-beds',PropertyController.updateTotalBeds)
router.delete('/:id', PropertyController.deleteProperty);
router.put('/properties/:id/location', PropertyController.updateLocation);

router.get('/:id/reviews', cacheMiddleware, reviewController.getPropertyReviews);
router.post('/:id/reviews', reviewController.addReview);
router.put('/:id/reviews/:reviewId', reviewController.editReview);
router.delete('/:id/reviews/:reviewId', reviewController.deleteReview);

router.get('/:id/amenities', cacheMiddleware, amenitiesController.getAmenities);
router.post('/:id/amenities', amenitiesController.addAmenity);
router.delete('/:id/amenities', amenitiesController.deleteAmenity);

router.post('/:id/rules', rulesController.addRule);
router.get('/:id/rules', cacheMiddleware, rulesController.getRules);
router.delete('/:id/rules/:ruleId', rulesController.deleteRule);
router.get('/:id/owner', cacheMiddleware, PropertyController.getOwnerInfo);

//yet to implement
router.post('/:id/images', imagesController.uploadImages);
router.delete('/:id/images/:imageId', imagesController.deleteImage);
router.get('/:id/images', cacheMiddleware, imagesController.getImages); 
router.put('/:id/images/:imageId', imagesController.updateImage); 

router.get('/:id/availability', cacheMiddleware, PropertyController.getAvailability);
router.put('/:id/availability', PropertyController.updateAvailability);

module.exports = router;
