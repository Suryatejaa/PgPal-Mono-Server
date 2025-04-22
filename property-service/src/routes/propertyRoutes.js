const express = require('express');
const router = express.Router();
const PropertyController = require('../controllers/propertyController');
const reviewController = require('../controllers/reviewController');
const amenitiesController = require('../controllers/amenitiesController');
const imagesController = require('../controllers/imagesController');
const rulesController = require('../controllers/rulesController');

router.post('/', PropertyController.addProperty);
router.get('/', PropertyController.getAllProperties);
router.get('/own', PropertyController.getProperties);
router.get('/search', PropertyController.searchProperties);
router.get('/:id', PropertyController.getPropertyById);
router.get('/property/:id', PropertyController.getPropertyForRoom);
router.put('/:id', PropertyController.updateProperty);
router.delete('/:id', PropertyController.deleteProperty);

router.get('/:id/reviews', reviewController.getPropertyReviews);
router.post('/:id/reviews', reviewController.addReview);
router.put('/:id/reviews/:reviewId', reviewController.editReview);
router.delete('/:id/reviews/:reviewId', reviewController.deleteReview);

router.get('/:id/amenities', amenitiesController.getAmenities);
router.post('/:id/amenities', amenitiesController.addAmenity);
router.delete('/:id/amenities/:amenityName', amenitiesController.deleteAmenity);

router.post('/:id/rules', rulesController.addRule);
router.get('/:id/rules', rulesController.getRules);
router.delete('/:id/rules/:ruleId', rulesController.deleteRule);
router.get('/:id/owner', PropertyController.getOwnerInfo);

//yet to implement
router.post('/:id/images', imagesController.uploadImages);
router.delete('/:id/images/:imageId', imagesController.deleteImage);
router.get('/:id/images', imagesController.getImages); 
router.put('/:id/images/:imageId', imagesController.updateImage); 

router.get('/:id/availability', PropertyController.getAvailability);
router.put('/:id/availability', PropertyController.updateAvailability);

module.exports = router;
