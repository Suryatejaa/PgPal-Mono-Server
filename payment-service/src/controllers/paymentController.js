const Payment = require('../models/paymentModel');

const createPayment = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.user._id;
    const role = currentUser.user.role;

    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    try {
        const payment = new Payment(req.body);
        await payment.save();
        res.status(201).json(payment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getPayments = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.user._id;
    const role = currentUser.user.role;

    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    try {
        const payments = await Payment.find();
        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { createPayment, getPayments };
