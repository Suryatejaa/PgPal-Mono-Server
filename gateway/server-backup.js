const express = require('express');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { ALLOWED_ORIGINS } = require('./cors-config'); // Assuming you have a config file for allowed origins

const app = express();

// CORS Middleware


const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        console.log(`🌐 CORS Check - Origin: ${origin}, Allowed: ${ALLOWED_ORIGINS.includes(origin)}`);

        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`❌ CORS blocked origin: ${origin}`);
            callback(new Error(`Not allowed by CORS: ${origin}`));
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
        'Cookie',
        'Set-Cookie',
        'x-user',
        'x-internal-service',
        'x-debug',
        'Connection',
        'Upgrade'
    ],
    exposedHeaders: [
        'Authorization',
        'Refresh-Token',
        'Set-Cookie'
    ]
};


app.use(cors(corsOptions));

// Enhanced preflight handler to override nginx CORS headers
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;

        if (origin && ALLOWED_ORIGINS.includes(origin)) {
            console.log(`🎯 Preflight: Setting specific origin '${origin}' for OPTIONS request`);
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
            res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-user, x-debug, Accept, Origin, X-Requested-With');
            res.header('Access-Control-Max-Age', '86400'); // 24 hours
            return res.status(204).end();
        } else {
            console.warn(`❌ Preflight blocked origin: ${origin}`);
        }
    }
    next();
});

app.options('*', cors(corsOptions)); // Enable pre-flight requests for all routes
app.use((req, res, next) => {
    // Aggressive CORS override to handle nginx-level wildcard headers
    const originalSetHeader = res.setHeader;
    const originalEnd = res.end;
    const originalWriteHead = res.writeHead;

    const getValidOrigin = () => {
        const origin = req.headers.origin;
        return origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
    };

    // Override setHeader to prevent wildcard origins
    res.setHeader = function (name, value) {
        if (name.toLowerCase() === 'access-control-allow-origin') {
            const validOrigin = getValidOrigin();
            if (value === '*' && validOrigin) {
                console.log(`🔧 CORS Override: Replacing '*' with '${validOrigin}'`);
                return originalSetHeader.call(this, name, validOrigin);
            } else if (validOrigin) {
                return originalSetHeader.call(this, name, validOrigin);
            }
        }
        return originalSetHeader.call(this, name, value);
    };

    // Override writeHead to catch headers set at response time
    res.writeHead = function (statusCode, statusMessage, headers) {
        const validOrigin = getValidOrigin();
        if (validOrigin) {
            // Force correct CORS headers
            if (!headers) headers = {};
            headers['Access-Control-Allow-Origin'] = validOrigin;
            headers['Access-Control-Allow-Credentials'] = 'true';
            headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
            headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, x-user, x-debug, Accept, Origin, X-Requested-With';
            console.log(`🔧 CORS writeHead Override: Setting origin to '${validOrigin}'`);
        }
        return originalWriteHead.call(this, statusCode, statusMessage, headers);
    };

    // Final safety net before response ends
    res.end = function (chunk, encoding) {
        const validOrigin = getValidOrigin();
        if (validOrigin) {
            // Force override any existing headers
            this.setHeader('Access-Control-Allow-Origin', validOrigin);
            this.setHeader('Access-Control-Allow-Credentials', 'true');
            this.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
            this.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-user, x-debug, Accept, Origin, X-Requested-With');
            console.log(`🔧 CORS Final Override: Ensuring origin is '${validOrigin}'`);
        }

        return originalEnd.call(this, chunk, encoding);
    };

    next();
});
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
            'auth-service': 'http://auth-service:4001/health',
            'property-service': 'http://property-service:4002/health',
            'room-service': 'http://room-service:4003/health',
            'tenant-service': 'http://tenant-service:4004/health',
            'complaint-service': 'http://complaint-service:4006/health',
            'kitchen-service': 'http://kitchen-service:4007/health',
            'dashboard-service': 'http://dashboard-service:4008/health',
            'notification-service': 'http://notification-service:4009/health',
            'rent-service': 'http://rent-service:4005/health'
            // 'payment-service': 'http://payment-service:4010/health'
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
            'auth-service', 'property-service', 'room-service', 'tenant-service', 'rent-service',
            'complaint-service', 'kitchen-service', 'dashboard-service',
            'notification-service'
            // 'payment-service'
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

    console.log(`🔐 Authenticating request with token: ${token}`);

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
        console.error('Error during authentication:', error);
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

const createCORSProxy = (target, serviceName, requireAuth = true) => {
    const middlewares = [];

    // Add authentication if required
    if (requireAuth) {
        middlewares.push(authenticate, attachUserHeader);
    }

    // Add the proxy middleware with CORS handling
    middlewares.push(
        createProxyMiddleware({
            target,
            changeOrigin: true,
            timeout: 30000,

            pathRewrite: function (path, req) {
                // For auth service, don't rewrite the path since it expects /api/auth-service
                if (serviceName === 'auth-service') {
                    console.log(`🔧 [${serviceName}] Path preserved: ${path}`);
                    return path; // Keep full path for auth service
                }

                // For other services, strip the API prefix if needed
                const newPath = path.replace(`/api/${serviceName}`, '');
                console.log(`🔧 [${serviceName}] Path rewrite: ${path} → ${newPath}`);
                return newPath;
            },

            onProxyReq: (proxyReq, req, res) => {
                // Track request
                errorTracker.addRequest(serviceName);

                // Add request metadata
                proxyReq.setHeader('X-Gateway-Request-Id', `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
                proxyReq.setHeader('X-Gateway-Timestamp', new Date().toISOString());
                proxyReq.setHeader('X-Internal-Service', 'true'); // Tell downstream services this is internal
            },

            onProxyRes: (proxyRes, req, res) => {
                const duration = Date.now() - req.startTime;
                const origin = req.headers.origin;

                // **UNIFIED CORS HANDLING FOR ALL SERVICES**
                if (origin && ALLOWED_ORIGINS.includes(origin)) {
                    // Override any existing CORS headers from downstream services
                    proxyRes.headers['access-control-allow-origin'] = origin;
                    proxyRes.headers['access-control-allow-credentials'] = 'true';
                    proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
                    proxyRes.headers['access-control-allow-headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Set-Cookie, x-user, x-internal-service, x-debug';
                    proxyRes.headers['access-control-expose-headers'] = 'Authorization, Refresh-Token, Set-Cookie, Content-Disposition';
                    proxyRes.headers['access-control-max-age'] = '86400';

                    console.log(`🔧 [${serviceName}] CORS Override: Set origin to '${origin}'`);
                }

                // Remove any wildcard origins from downstream services
                if (proxyRes.headers['access-control-allow-origin'] === '*') {
                    delete proxyRes.headers['access-control-allow-origin'];
                    if (origin && ALLOWED_ORIGINS.includes(origin)) {
                        proxyRes.headers['access-control-allow-origin'] = origin;
                        proxyRes.headers['access-control-allow-credentials'] = 'true';
                        console.log(`🔧 [${serviceName}] CORS Override: Replaced '*' with '${origin}'`);
                    }
                }

                // Log response details
                if (proxyRes.statusCode >= 400) {
                    console.error(`🚨 [${serviceName}] ERROR ${proxyRes.statusCode}: ${req.method} ${req.originalUrl} (${duration}ms)`);

                    errorTracker.addError({
                        service: serviceName,
                        method: req.method,
                        url: req.originalUrl,
                        status: proxyRes.statusCode,
                        duration,
                        userAgent: req.headers['user-agent'],
                        userId: req.user?.data?.user?._id || 'anonymous',
                        userRole: req.user?.data?.user?.role || 'unknown',
                        ip: req.ip || req.connection.remoteAddress
                    });
                }
            },

            onError: (err, req, res) => {
                const duration = Date.now() - req.startTime;
                console.error(`🔥 [${serviceName}] PROXY ERROR (${duration}ms):`, err.message);

                errorTracker.addError({
                    service: serviceName,
                    method: req.method,
                    url: req.originalUrl,
                    status: 500,
                    duration,
                    error: err.message,
                    type: 'proxy_error',
                    userId: req.user?.data?.user?._id || 'anonymous'
                });

                if (!res.headersSent) {
                    // **ENSURE CORS HEADERS EVEN ON ERROR**
                    const origin = req.headers.origin;
                    if (origin && ALLOWED_ORIGINS.includes(origin)) {
                        res.setHeader('Access-Control-Allow-Origin', origin);
                        res.setHeader('Access-Control-Allow-Credentials', 'true');
                        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
                        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Set-Cookie, x-user, x-internal-service');
                    }

                    res.status(500).json({
                        error: `${serviceName} temporarily unavailable`,
                        service: serviceName,
                        timestamp: new Date().toISOString(),
                        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                    });
                }
            }
        })
    );

    return middlewares;
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
            'rent-service': { port: 4005, ...serviceHealth['rent-service'] },
            'complaint-service': { port: 4006, ...serviceHealth['complaint-service'] },
            'kitchen-service': { port: 4007, ...serviceHealth['kitchen-service'] },
            'dashboard-service': { port: 4008, ...serviceHealth['dashboard-service'] },
            'notification-service': { port: 4009, ...serviceHealth['notification-service'] },
            // 'payment-service': { port: 4010, ...serviceHealth['payment-service'] }
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
// 🔐 Auth Service (No authentication required for login/register)
app.use('/api/auth-service', (req, res, next) => {
    console.log(`🔍 [DEBUG] Auth route hit: ${req.method} ${req.originalUrl}`);
    console.log(`🔍 [DEBUG] Request URL: ${req.url}`);
    console.log(`🔍 [DEBUG] Will proxy to: http://auth-service:4001${req.url}`);
    next();
}, ...createCORSProxy('http://auth-service:4001', 'auth-service', false));

// 🏠 Property Service
app.use('/api/property-service', ...createCORSProxy('http://property-service:4002', 'property-service'));
app.use('/api/property-service/monitor', ...createCORSProxy('http://property-service:4002', 'property-service-monitor'));
app.use('/api/admin/property-service', ...createCORSProxy('http://property-service:4002', 'admin-property-service'));

// 🏠 Room Service
app.use('/api/room-service', ...createCORSProxy('http://room-service:4003', 'room-service'));
app.use('/api/room-service/monitor', ...createCORSProxy('http://room-service:4003', 'room-service-monitor'));
app.use('/api/admin/room-service', ...createCORSProxy('http://room-service:4003', 'admin-room-service'));

// 👥 Tenant Service
app.use('/api/tenant-service', ...createCORSProxy('http://tenant-service:4004', 'tenant-service'));
app.use('/api/tenant-service/monitor', ...createCORSProxy('http://tenant-service:4004', 'tenant-service-monitor'));

app.use('/api/rent-service', ...createCORSProxy('http://rent-service:4005', 'rent-service'));
// 💰 Payment Service (uncomment when ready)
// app.use('/api/payment-service', ...createCORSProxy('http://payment-service:4010', 'payment-service'));

// 📝 Complaint Service
app.use('/api/complaint-service', ...createCORSProxy('http://complaint-service:4006', 'complaint-service'));
app.use('/api/complaint-service/monitor', ...createCORSProxy('http://complaint-service:4006', 'complaint-service-monitor'));

// 🍽️ Kitchen Service
app.use('/api/kitchen-service', ...createCORSProxy('http://kitchen-service:4007', 'kitchen-service'));
app.use('/api/kitchen-service/monitor', ...createCORSProxy('http://kitchen-service:4007', 'kitchen-service-monitor'));

// 📊 Dashboard Service
app.use('/api/dashboard-service', ...createCORSProxy('http://dashboard-service:4008', 'dashboard-service'));
app.use('/api/dashboard-service/monitor', ...createCORSProxy('http://dashboard-service:4008', 'dashboard-service-monitor'));

// 🔔 Notification Service
app.use('/api/notification-service', ...createCORSProxy('http://notification-service:4009', 'notification-service'));
app.use('/api/notification-service/monitor', ...createCORSProxy('http://notification-service:4009', 'notification-service-monitor'));
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
    console.log(`🔍 Error monitoring: http://46.62.142.3:${PORT}/api/gateway/errors`);
    console.log(`📈 Service status: http://46.62.142.3:${PORT}/api/gateway/services`);
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