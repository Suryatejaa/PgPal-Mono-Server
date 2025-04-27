const express = require('express');
const router = express.Router();

const cacheMiddleware = require('../utils/cacheMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.get('/overview/:propertyPpid', cacheMiddleware, dashboardController.getOverview);
router.get('/checkins/:propertyPpid', cacheMiddleware, dashboardController.getCheckins);
router.get('/vacates/:propertyPpid', cacheMiddleware, dashboardController.getVacates);
router.get('/complaints/:propertyPpid', cacheMiddleware, dashboardController.getComplaintStats);

module.exports = router;