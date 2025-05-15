const express = require('express');
const router = express.Router();
const ComplaintController = require('../controllers/complainsController');
const cacheMiddleware = require('../utils/cacheMiddleware');


router.post('/', ComplaintController.addComplaint);
router.put('/:id', ComplaintController.updateComplaint); // status update
router.delete('/:id', ComplaintController.deleteComplaint); // hard delete

router.get('/', cacheMiddleware, ComplaintController.getComplaints); // filters: ?propertyId=...&tenantId=...&status=...
router.get('/:id', cacheMiddleware, ComplaintController.getComplaintById);
router.get('/metrics/summary', cacheMiddleware,ComplaintController.getComplaintMetrics)
router.get('/metrics/summary/:propertyId', cacheMiddleware, ComplaintController.getComplaintMetricsByPropertyId) // filters

module.exports = router;
    