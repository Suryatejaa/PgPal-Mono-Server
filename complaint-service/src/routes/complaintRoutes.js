const express = require('express');
const router = express.Router();
const authenticate = require('../../utils/authenticate');
const ComplaintController = require('../controllers/complaintController');

router.post('/', authenticate, ComplaintController.addComplaint);
router.get('/', authenticate, ComplaintController.getComplaints);
router.get('/:id', authenticate, ComplaintController.getComplaintById);
router.put('/:id', authenticate, ComplaintController.updateComplaint);
router.delete('/:id', authenticate, ComplaintController.deleteComplaint);

module.exports = router;
