const express = require('express');
const { createPayment, getPayments } = require('../controllers/paymentController');

const router = express.Router();

router.post('/', createPayment);
router.get('/', getPayments);

module.exports = router;
