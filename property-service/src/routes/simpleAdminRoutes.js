const express = require('express');
const router = express.Router();

// Simple working admin routes for testing
router.get('/test', (req, res) => {
    res.json({
        message: 'Admin routes working!',
        timestamp: new Date(),
        path: req.path,
        method: req.method
    });
});

router.get('/status', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Admin Dashboard',
        timestamp: new Date()
    });
});

module.exports = router;
