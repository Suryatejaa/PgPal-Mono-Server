const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const roomGetController = require('../controllers/roomGetController');
const bedController = require('../controllers/bedsController');

// Room CRUD operations
router.post('/rooms', roomController.addRoom);
router.put('/rooms/:roomId', roomController.updateRoom);
router.delete('/rooms/:roomId', roomController.deleteRoom);

router.patch('/rooms/:roomId/assign-bed', bedController.assignBed);
router.patch('/rooms/:roomId/clear-bed', bedController.clearBed);

// Room retrieval by property
router.get('/:id/rooms', roomGetController.getRoomsByPropertyId);
router.get('/:id/rooms/search', roomGetController.searchRooms);
router.get('/:id/rooms/:type', roomGetController.getRoomAvailabilityByType);

// Room summary and availability of property
router.get('/:id/summary', roomGetController.getPropertySummary);
router.get('/:id/summary-type', roomGetController.getPropertySummaryByType);

// Room and bed details
router.get('/rooms/:roomId', roomGetController.getRoomById);
router.get('/:roomId/beds-availability', roomGetController.getRoomAvailability);

module.exports = router;