const express = require('express');
const rentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/update', rentController.updateRent);               // Owner-only
router.get('/:tenantId/status', rentController.getRentStatus);   // Owner-only
router.get('/:propertyPpid/summary', rentController.getRentSummary); // Owner-only
router.get('/:propertyPpid/defaulters', rentController.getRentDefaulters); // Owner-only

module.exports = router;
