const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const roomGetController = require('../controllers/roomGetController');
const bedController = require('../controllers/bedsController');
const cacheMiddleware = require('../utils/cacheMiddleware')


// Room CRUD operations
router.post('/rooms', roomController.addRoom);
router.put('/rooms/:roomId', roomController.updateRoom);
router.delete('/rooms/:roomId', roomController.deleteRoom);

router.patch('/rooms/:roomId/assign-bed', bedController.assignBed);
router.patch('/rooms/:roomId/clear-bed', bedController.clearBed);

// Room retrieval by property
router.get('/:id/rooms', cacheMiddleware, roomGetController.getRoomsByPropertyId);
router.get('/:id/rooms/search', cacheMiddleware, roomGetController.searchRooms);
router.get('/:id/rooms/:type', cacheMiddleware, roomGetController.getRoomAvailabilityByType);

router.get('/roomDocs/:pppid', cacheMiddleware, roomGetController.getRoomDocs);
router.get('/bedDocs/:pppid', cacheMiddleware, roomGetController.getBedDocs);


// Room summary and availability of property
router.get('/:id/summary', cacheMiddleware, roomGetController.getPropertySummary);
router.get('/:id/summary-type', cacheMiddleware, roomGetController.getPropertySummaryByType);

// Room and bed details
router.get('/rooms/:roomId', cacheMiddleware, roomGetController.getRoomById);
router.get('/:roomId/beds-availability', cacheMiddleware, roomGetController.getRoomAvailability);

module.exports = router;