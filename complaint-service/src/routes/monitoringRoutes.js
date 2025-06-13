const express = require('express');
const router = express.Router();
const {
    getInternalApiStats,
    getInternalApiErrors,
    checkInternalApiHealth
} = require('../controllers/internalApis');

// Internal API monitoring endpoints
router.get('/internal-api/stats', getInternalApiStats);
router.get('/internal-api/errors', getInternalApiErrors);
router.get('/internal-api/health', checkInternalApiHealth);

// Service health endpoint
router.get('/health', (req, res) => {
    res.json({
        service: 'complaint-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
    });
});

// Service metrics endpoint
router.get('/metrics', (req, res) => {
    res.json({
        service: 'complaint-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

module.exports = router;