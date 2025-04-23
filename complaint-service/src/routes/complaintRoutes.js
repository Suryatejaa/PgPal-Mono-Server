const express = require('express');
const router = express.Router();
const ComplaintController = require('../controllers/complainsController');

router.post('/', ComplaintController.addComplaint);
router.get('/', ComplaintController.getComplaints); // filters: ?propertyId=...&tenantId=...&status=...
router.get('/:id', ComplaintController.getComplaintById);
router.put('/:id', ComplaintController.updateComplaint); // status update
router.delete('/:id', ComplaintController.deleteComplaint); // hard delete
router.get('/metrics/summary', ComplaintController.getComplaintMetrics)
router.get('/metrics/summary/:propertyId', ComplaintController.getComplaintMetricsByPropertyId) // filters

module.exports = router;
