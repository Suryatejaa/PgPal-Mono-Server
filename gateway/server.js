const express = require('express');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

// CORS Middleware


const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:4000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:4000',
            'http://localhost:5175',
            'http://127.0.0.1:5175',
             process.env.FRONTEND_URL || 'http://localhost:5173',
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // This is crucial for cookies
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'x-user',
        'x-internal-service',
        'x-debug'
    ]
};


app.use(cors(corsOptions));

// Enhanced Error Tracking System
// Enhanced Error Tracking System with Real Health Checks
const errorTracker = {
    errors: [],
    requestCount: 0,
    serviceHealth: {},
    lastHealthCheck: {},
    healthCheckInterval: 30000, // 30 seconds

    addError: (error) => {
        errorTracker.errors.push({
            id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            ...error
        });

        // Keep only last 1000 errors
        if (errorTracker.errors.length > 1000) {
            errorTracker.errors.shift();
        }

        // Update service health
        if (!errorTracker.serviceHealth[error.service]) {
            errorTracker.serviceHealth[error.service] = {
                errors: 0,
                requests: 0,
                lastSeen: new Date(),
                isOnline: true
            };
        }
        errorTracker.serviceHealth[error.service].errors++;

        // Send alert for critical errors
        if (error.status >= 500) {
            sendErrorAlert(error);
        }
    },

    addRequest: (service) => {
        errorTracker.requestCount++;
        if (!errorTracker.serviceHealth[service]) {
            errorTracker.serviceHealth[service] = {
                errors: 0,
                requests: 0,
                lastSeen: new Date(),
                isOnline: true
            };
        }
        errorTracker.serviceHealth[service].requests++;
        errorTracker.serviceHealth[service].lastSeen = new Date();
        errorTracker.serviceHealth[service].isOnline = true;
    },

    // ✅ Enhanced service health check with actual ping
    getServiceHealth: async () => {
        const services = {
            'auth-service': 'http://auth-service:4001/api/auth-service/health',
            'property-service': 'http://property-service:4002/api/property-service/health',
            'room-service': 'http://room-service:4003/api/room-service/health',
            'tenant-service': 'http://tenant-service:4004/api/tenant-service/health',
            'complaint-service': 'http://complaint-service:4006/api/complaint-service/health',
            'kitchen-service': 'http://kitchen-service:4007/api/kitchen-service/health',
            'dashboard-service': 'http://dashboard-service:4008/api/dashboard-service/health',
            'notification-service': 'http://notification-service:4009/api/notification-service/health',
            'payment-service': 'http://payment-service:4010/api/payment-service/health'
        };

        const healthStatus = {};

        for (const [serviceName, healthUrl] of Object.entries(services)) {
            const stats = errorTracker.serviceHealth[serviceName] || {
                errors: 0,
                requests: 0,
                lastSeen: null,
                isOnline: false
            };

            try {
                // ✅ Actual health check ping
                const response = await axios.get(healthUrl, {
                    timeout: 5000,
                    headers: { 'x-internal-service': true }
                });

                const errorRate = stats.requests > 0 ? (stats.errors / stats.requests * 100) : 0;
                const isRecentlyActive = stats.lastSeen && (Date.now() - stats.lastSeen.getTime()) < 300000; // 5 minutes

                healthStatus[serviceName] = {
                    status: 'healthy',
                    isOnline: true,
                    responseTime: response.headers['x-response-time'] || 'N/A',
                    errorRate: errorRate.toFixed(2),
                    requests: stats.requests,
                    errors: stats.errors,
                    lastSeen: stats.lastSeen,
                    isRecentlyActive,
                    healthCheckTime: new Date().toISOString()
                };

                // Update tracking
                errorTracker.serviceHealth[serviceName] = {
                    ...stats,
                    isOnline: true,
                    lastHealthCheck: new Date()
                };

            } catch (error) {
                // ✅ Service is actually offline
                const errorRate = stats.requests > 0 ? (stats.errors / stats.requests * 100) : 0;
                const isRecentlyActive = stats.lastSeen && (Date.now() - stats.lastSeen.getTime()) < 300000;

                healthStatus[serviceName] = {
                    status: 'offline',
                    isOnline: false,
                    responseTime: 'timeout',
                    errorRate: errorRate.toFixed(2),
                    requests: stats.requests,
                    errors: stats.errors,
                    lastSeen: stats.lastSeen,
                    isRecentlyActive,
                    healthCheckTime: new Date().toISOString(),
                    healthCheckError: error.code || error.message
                };

                // Update tracking
                errorTracker.serviceHealth[serviceName] = {
                    ...stats,
                    isOnline: false,
                    lastHealthCheck: new Date()
                };

                console.error(`🔴 [HEALTH CHECK] ${serviceName} is offline: ${error.message}`);
            }
        }

        return healthStatus;
    },

    // ✅ Lightweight service health for frequent checks
    getServiceHealthCached: () => {
        const healthStatus = {};
        const services = [
            'auth-service', 'property-service', 'room-service', 'tenant-service',
            'complaint-service', 'kitchen-service', 'dashboard-service',
            'notification-service', 'payment-service'
        ];

        services.forEach(serviceName => {
            const stats = errorTracker.serviceHealth[serviceName] || {
                errors: 0,
                requests: 0,
                lastSeen: null,
                isOnline: false
            };

            const errorRate = stats.requests > 0 ? (stats.errors / stats.requests * 100) : 0;
            const isRecentlyActive = stats.lastSeen && (Date.now() - stats.lastSeen.getTime()) < 300000; // 5 minutes

            // Determine status based on multiple factors
            let status = 'unknown';
            if (stats.isOnline === false) {
                status = 'offline';
            } else if (errorRate > 15) {
                status = 'unhealthy';
            } else if (errorRate > 8) {
                status = 'degraded';
            } else if (isRecentlyActive || stats.requests > 0) {
                status = 'healthy';
            } else {
                status = 'idle'; // No recent activity but not confirmed offline
            }

            healthStatus[serviceName] = {
                status,
                isOnline: stats.isOnline,
                errorRate: errorRate.toFixed(2),
                requests: stats.requests,
                errors: stats.errors,
                lastSeen: stats.lastSeen,
                isRecentlyActive,
                lastHealthCheck: stats.lastHealthCheck
            };
        });

        return healthStatus;
    },

    // ... rest of existing methods
    getErrors: (filters = {}) => {
        let errors = [...errorTracker.errors];

        if (filters.service) {
            errors = errors.filter(e => e.service === filters.service);
        }

        if (filters.status) {
            errors = errors.filter(e => e.status == filters.status);
        }

        if (filters.since) {
            const since = new Date(filters.since);
            errors = errors.filter(e => new Date(e.timestamp) >= since);
        }

        return errors.reverse();
    },

    getErrorStats: () => {
        const now = new Date();
        const last24h = errorTracker.errors.filter(e =>
            now - new Date(e.timestamp) < 24 * 60 * 60 * 1000
        );
        const lastHour = errorTracker.errors.filter(e =>
            now - new Date(e.timestamp) < 60 * 60 * 1000
        );

        const byService = {};
        const byStatus = {};
        const byEndpoint = {};

        last24h.forEach(error => {
            byService[error.service] = (byService[error.service] || 0) + 1;
            byStatus[error.status] = (byStatus[error.status] || 0) + 1;
            const endpoint = `${error.method} ${error.url}`;
            byEndpoint[endpoint] = (byEndpoint[endpoint] || 0) + 1;
        });

        const serviceErrorRates = {};
        Object.keys(errorTracker.serviceHealth).forEach(service => {
            const health = errorTracker.serviceHealth[service];
            serviceErrorRates[service] = {
                errorRate: health.requests > 0 ? (health.errors / health.requests * 100).toFixed(2) : 0,
                totalRequests: health.requests,
                totalErrors: health.errors,
                isOnline: health.isOnline,
                lastSeen: health.lastSeen
            };
        });

        return {
            total24h: last24h.length,
            totalLastHour: lastHour.length,
            totalRequests: errorTracker.requestCount,
            overallErrorRate: errorTracker.requestCount > 0 ?
                (errorTracker.errors.length / errorTracker.requestCount * 100).toFixed(2) : 0,
            byService,
            byStatus,
            topFailingEndpoints: Object.entries(byEndpoint)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([endpoint, count]) => ({ endpoint, count })),
            serviceErrorRates,
            recentErrors: last24h.slice(-5).reverse()
        };
    }
};

// Alert system for critical errors
const sendErrorAlert = async (error) => {
    try {
        console.error(`🚨 CRITICAL ERROR ALERT 🚨`);
        console.error(`Service: ${error.service}`);
        console.error(`Status: ${error.status}`);
        console.error(`Endpoint: ${error.method} ${error.url}`);
        console.error(`Time: ${error.timestamp}`);
        console.error(`User: ${error.userId || 'anonymous'}`);

        // You can integrate with external monitoring services here
        // await sendToSlack(error);
        // await sendToDatadog(error);
        // await sendEmail(error);

    } catch (alertError) {
        console.error('Failed to send error alert:', alertError.message);
    }
};

// Enhanced logging middleware
app.use((req, res, next) => {
    req.startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        const logLevel = res.statusCode >= 400 ? 'ERROR' : 'INFO';
        if (res.statusCode >= 400) {
            console.error(`[${logLevel}] [${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        }// } else {
        //     // console.log(`[${logLevel}] [${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        // }        
    });

    next();
});

app.use(cookieParser());

const authenticate = async (req, res, next) => {
    if (req.headers['x-internal-service']) {
        return next();
    }

    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: 'Missing token' });
    }

    try {
        const response = await axios.post('http://auth-service:4001/api/auth-service/protected', {}, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            withCredentials: true,
        });

        if (response.status === 200) {
            req.user = { data: response.data, token };
            return next();
        } else {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    } catch (error) {
        console.error('Error during authentication:', error.response?.data || error.message);
        if (error.response && error.response.status === 401) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.status(500).json({ error: error.response?.data || 'Internal Server Error' });
    }
};

function attachUserHeader(req, res, next) {
    if (req.headers['x-internal-service']) return next();
    if (req.user) {
        req.headers['x-user'] = JSON.stringify(req.user);
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Missing user context' });
}

// Enhanced proxy middleware with error tracking
const createEnhancedProxy = (target, serviceName) => {
    return createProxyMiddleware({
        target,
        changeOrigin: true,
        timeout: 30000, // 30 second timeout

        onProxyReq: (proxyReq, req, res) => {
            // Track request
            errorTracker.addRequest(serviceName);

            // Add request metadata
            proxyReq.setHeader('X-Gateway-Request-Id', `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
            proxyReq.setHeader('X-Gateway-Timestamp', new Date().toISOString());
        },

        onProxyRes: (proxyRes, req, res) => {
            const duration = Date.now() - req.startTime;

            // Log response details
            if (proxyRes.statusCode >= 400) {
                console.error(`🚨 [${serviceName}] ERROR ${proxyRes.statusCode}: ${req.method} ${req.originalUrl} (${duration}ms)`);

                // Track error
                errorTracker.addError({
                    service: serviceName,
                    method: req.method,
                    url: req.originalUrl,
                    status: proxyRes.statusCode,
                    duration,
                    userAgent: req.headers['user-agent'],
                    userId: req.user?.data?.user?._id || 'anonymous',
                    userRole: req.user?.data?.user?.role || 'unknown',
                    ip: req.ip || req.connection.remoteAddress,
                    headers: {
                        'content-type': req.headers['content-type'],
                        'authorization': req.headers['authorization'] ? '[REDACTED]' : undefined
                    }
                });
            } else {
                // console.log(`✅ [${serviceName}] ${req.method} ${req.originalUrl} - ${proxyRes.statusCode} (${duration}ms)`);
            }
        },

        onError: (err, req, res) => {
            const duration = Date.now() - req.startTime;
            console.error(`🔥 [${serviceName}] PROXY ERROR (${duration}ms):`, err.message);

            // Track proxy error
            errorTracker.addError({
                service: serviceName,
                method: req.method,
                url: req.originalUrl,
                status: 500,
                duration,
                error: err.message,
                type: 'proxy_error',
                userId: req.user?.data?.user?._id || 'anonymous',
                userRole: req.user?.data?.user?.role || 'unknown',
                ip: req.ip || req.connection.remoteAddress
            });

            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Service temporarily unavailable',
                    service: serviceName,
                    timestamp: new Date().toISOString(),
                    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                });
            }
        }
    });
};

// Gateway monitoring and health endpoints
app.get('/api/gateway/health', async (req, res) => {
    const stats = errorTracker.getErrorStats();
    const serviceHealth = await errorTracker.getServiceHealth(); // Real health check

    const overallStatus = Object.values(serviceHealth).every(s => s.status === 'healthy')
        ? 'healthy'
        : Object.values(serviceHealth).some(s => s.status === 'offline')
            ? 'degraded'
            : 'partial';

    res.json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        errorStats: stats,
        serviceHealth,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/api/gateway/errors', (req, res) => {
    const { limit = 50, service, status, since } = req.query;

    const filters = {};
    if (service) filters.service = service;
    if (status) filters.status = status;
    if (since) filters.since = since;

    const errors = errorTracker.getErrors(filters);

    res.json({
        errors: errors.slice(0, parseInt(limit)),
        total: errors.length,
        filters,
        stats: errorTracker.getErrorStats()
    });
});

app.get('/api/gateway/errors/stats', (req, res) => {
    res.json(errorTracker.getErrorStats());
});

app.get('/api/gateway/services', (req, res) => {
    const serviceHealth = errorTracker.getServiceHealth();

    res.json({
        services: {
            'auth-service': { port: 4001, ...serviceHealth['auth-service'] },
            'property-service': { port: 4002, ...serviceHealth['property-service'] },
            'room-service': { port: 4003, ...serviceHealth['room-service'] },
            'tenant-service': { port: 4004, ...serviceHealth['tenant-service'] },
            'complaint-service': { port: 4006, ...serviceHealth['complaint-service'] },
            'kitchen-service': { port: 4007, ...serviceHealth['kitchen-service'] },
            'dashboard-service': { port: 4008, ...serviceHealth['dashboard-service'] },
            'notification-service': { port: 4009, ...serviceHealth['notification-service'] },
            'payment-service': { port: 4010, ...serviceHealth['payment-service'] }
        },
        timestamp: new Date().toISOString()
    });
});

// Clear errors endpoint (for maintenance)
app.delete('/api/gateway/errors', (req, res) => {
    const { confirm } = req.query;

    if (confirm === 'true') {
        const clearedCount = errorTracker.errors.length;
        errorTracker.errors = [];
        errorTracker.serviceHealth = {};
        errorTracker.requestCount = 0;

        res.json({
            message: 'Error logs cleared successfully',
            clearedCount,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            error: 'Confirmation required. Add ?confirm=true to clear all error logs.'
        });
    }
});

// Service routes with enhanced monitoring
app.use('/api/auth-service',
    createProxyMiddleware({
        target: 'http://auth-service:4001',
        changeOrigin: true,
    })
);

app.use('/api/property-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://property-service:4002', 'property-service')
);

app.use('/api/property-service/monitor', authenticate, attachUserHeader,
    createEnhancedProxy('http://property-service:4002', 'property-service-monitor')
);

app.use('/api/admin/property-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://property-service:4002', 'admin-property-service')
);

app.use('/api/room-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://room-service:4003', 'room-service')
);

app.use('/api/room-service/monitor', authenticate, attachUserHeader,
    createEnhancedProxy('http://room-service:4003', 'room-service-monitor')
);

app.use('/api/admin/room-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://room-service:4003', 'admin-room-service')
);

app.use('/api/tenant-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://tenant-service:4004', 'tenant-service')
);

app.use('/api/tenant-service/monitor', authenticate, attachUserHeader,
    createEnhancedProxy('http://tenant-service:4004', 'tenant-service-monitor')
);

app.use('/api/rent-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://tenant-service:4004', 'rent-service')
);

app.use('/api/payment-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://payment-service:4010', 'payment-service')
);

app.use('/api/complaint-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://complaint-service:4006', 'complaint-service')
);

app.use('/api/complaint-service/monitor', authenticate, attachUserHeader,
    createEnhancedProxy('http://complaint-service:4006', 'complaint-service-monitor')
);

app.use('/api/kitchen-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://kitchen-service:4007', 'kitchen-service')
);

app.use('/api/kitchen-service/monitor', authenticate, attachUserHeader,
    createEnhancedProxy('http://kitchen-service:4007', 'kitchen-service-monitor')
);

app.use('/api/dashboard-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://dashboard-service:4008', 'dashboard-service')
);

app.use('/api/dashboard-service/monitor', authenticate, attachUserHeader,
    createEnhancedProxy('http://dashboard-service:4008', 'dashboard-service-monitor')
);

app.use('/api/notification-service', authenticate, attachUserHeader,
    createEnhancedProxy('http://notification-service:4009', 'notification-service')
);

app.use('/api/notification-service/monitor', authenticate, attachUserHeader,
    createEnhancedProxy('http://notification-service:4009', 'notification-service-monitor')
);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Gateway Error:', err);

    errorTracker.addError({
        service: 'gateway',
        method: req.method,
        url: req.originalUrl,
        status: 500,
        error: err.message,
        type: 'gateway_error',
        userId: req.user?.data?.user?._id || 'anonymous'
    });

    res.status(500).json({
        error: 'Gateway error occurred',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});

// Start the API Gateway
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`📊 Health endpoint: http://localhost:${PORT}/api/gateway/health`);
    console.log(`🔍 Error monitoring: http://localhost:${PORT}/api/gateway/errors`);
    console.log(`📈 Service status: http://localhost:${PORT}/api/gateway/services`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Gateway shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Gateway shutting down gracefully...');
    process.exit(0);
});