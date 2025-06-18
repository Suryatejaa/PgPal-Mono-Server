const express = require('express');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const { ALLOWED_ORIGINS } = require('./cors-config'); // Import allowed origins from separate config file

const app = express();

// ⚠️ CRITICAL FIX: Move body parsing middleware AFTER proxy setup
// This prevents Express from consuming the request body before proxy can handle it
app.use(cookieParser());

const PORT = process.env.PORT || 4000;
const USE_HTTPS = process.env.USE_HTTPS === 'true';

process.on('uncaughtException', (err, origin) => {
    console.error('🔥🔥🔥 GATEWAY CRASH! UNCAUGHT EXCEPTION!');
    console.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
    console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥🔥🔥 GATEWAY CRASH! UNHANDLED REJECTION!');
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error(reason.stack || reason);
    process.exit(1);
});

const SERVICES = {
    'auth-service': { url: 'http://auth-service:4001', port: 4001, requireAuth: false },
    'property-service': { url: 'http://property-service:4002', port: 4002, requireAuth: true },
    'room-service': { url: 'http://room-service:4003', port: 4003, requireAuth: true },
    'tenant-service': { url: 'http://tenant-service:4004', port: 4004, requireAuth: true },
    'rent-service': { url: 'http://rent-service:4005', port: 4005, requireAuth: true },
    'complaint-service': { url: 'http://complaint-service:4006', port: 4006, requireAuth: true },
    'kitchen-service': { url: 'http://kitchen-service:4007', port: 4007, requireAuth: true },
    'dashboard-service': { url: 'http://dashboard-service:4008', port: 4008, requireAuth: true },
    'notification-service': { url: 'http://notification-service:4009', port: 4009, requireAuth: true }
};

// Error Tracking System
class ErrorTracker {
    constructor() {
        this.errors = [];
        this.requestCount = 0;
        this.serviceHealth = {};
        this.maxErrors = 1000;
    }

    addError(error) {
        this.errors.push({
            id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            ...error
        });

        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        this.updateServiceHealth(error.service, false);

        if (error.status >= 500) {
            this.sendAlert(error);
        }
    }

    addRequest(service) {
        this.requestCount++;
        this.updateServiceHealth(service, true);
    }

    updateServiceHealth(service, isSuccess) {
        if (!this.serviceHealth[service]) {
            this.serviceHealth[service] = {
                errors: 0,
                requests: 0,
                lastSeen: new Date(),
                isOnline: true
            };
        }

        this.serviceHealth[service].requests++;
        this.serviceHealth[service].lastSeen = new Date();

        if (!isSuccess) {
            this.serviceHealth[service].errors++;
        }
    }

    async checkServiceHealth() {
        const healthResults = {};

        for (const [serviceName, config] of Object.entries(SERVICES)) {
            const startTime = Date.now();

            try {
                const response = await axios.get(`${config.url}/health`, {
                    timeout: 5000,
                    headers: { 'x-internal-service': 'true' }
                });

                healthResults[serviceName] = {
                    status: 'healthy',
                    responseTime: `${Date.now() - startTime}ms`,
                    data: response.data,
                    lastCheck: new Date().toISOString()
                };
            } catch (error) {
                healthResults[serviceName] = {
                    status: 'offline',
                    responseTime: `${Date.now() - startTime}ms`,
                    error: error.message,
                    lastCheck: new Date().toISOString()
                };
            }
        }

        return healthResults;
    }

    getStats() {
        const now = new Date();
        const last24h = this.errors.filter(e =>
            now - new Date(e.timestamp) < 24 * 60 * 60 * 1000
        );

        const byService = {};
        const byStatus = {};

        last24h.forEach(error => {
            byService[error.service] = (byService[error.service] || 0) + 1;
            byStatus[error.status] = (byStatus[error.status] || 0) + 1;
        });

        return {
            total24h: last24h.length,
            totalRequests: this.requestCount,
            overallErrorRate: this.requestCount > 0
                ? ((this.errors.length / this.requestCount) * 100).toFixed(2)
                : 0,
            byService,
            byStatus,
            recentErrors: last24h.slice(-5).reverse()
        };
    }

    sendAlert(error) {
        console.error(`🚨 CRITICAL ERROR: ${error.service} - ${error.status} - ${error.url}`);
        // Add external alerting here (Slack, email, etc.)
    }
}

const errorTracker = new ErrorTracker();

// CORS Configuration
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl)
        if (!origin) return callback(null, true);

        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`❌ CORS blocked: ${origin}`);
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept',
        'Authorization', 'Cookie', 'x-user', 'x-internal-service'
    ],
    exposedHeaders: ['Authorization', 'Set-Cookie', 'Refresh-Token']
};

// Middleware Setup
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight CORS requests


// Request logging
app.use((req, res, next) => {
    req.startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        const logLevel = res.statusCode >= 400 ? 'ERROR' : 'INFO';

        if (res.statusCode >= 400) {
            console.error(`[${logLevel}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        } else {
            console.log(`[${logLevel}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        }
    });

    next();
});

// Authentication middleware
const authenticate = async (req, res, next) => {
    // Skip auth for internal service calls
    if (req.headers['x-internal-service']) {
        return next();
    }

    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: 'Missing token' });
    }

    try {
        const response = await axios.post('http://auth-service:4001/protected', {}, {
            headers: {
                Authorization: `Bearer ${token}`,
                'x-internal-service': 'true' // Indicate this is an internal service call
            },
            withCredentials: true
        });

        if (response.status === 200) {
            req.user = {
                data: {
                    user: response.data.user
                },
                token
            };
            req.headers['x-user'] = JSON.stringify(req.user);
            return next();
        }
    } catch (error) {
        console.error('Authentication failed:', error.message);
        return res.status(401).json({ error: 'Unauthorized' });
    }
};

// 🔧 FIXED: Improved proxy middleware factory
function createServiceProxy(serviceName, serviceConfig) {
    return createProxyMiddleware({
        target: serviceConfig.url,
        changeOrigin: true,
        pathRewrite: {
            [`^/api/${serviceName}`]: '',
        },
        selfHandleResponse: false,
        parseReqBody: false,

        onProxyReq: (proxyReq, req, res) => {
            console.log(`🔄 [Gateway] -> [${serviceName}]: ${req.method} ${req.path}`);
            console.log(`🔍 [Gateway] Headers:`, {
                'x-user': req.headers['x-user'] ? 'Present' : 'Missing',
                'cookie': req.headers.cookie ? 'Present' : 'Missing',
                'content-type': req.headers['content-type']
            });

            // Add user data if available
            if (req.user) {
                const userData = JSON.stringify(req.user);
                proxyReq.setHeader('x-user', userData);
                proxyReq.setHeader('x-internal-service', 'true');
                console.log(`✅ [Gateway] User attached:`, {
                    userId: req.user.data?.user?._id || req.user._id,
                    role: req.user.data?.user?.role || req.user.role
                });
            } else {
                console.log(`⚠️  [Gateway] No user data available for ${req.path}`);
            }

            // Forward cookies
            if (req.headers.cookie) {
                proxyReq.setHeader('Cookie', req.headers.cookie);
                console.log(`🍪 [Gateway] Forwarding cookies`);
            }

            // Log body size for POST/PUT/PATCH
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                const bodySize = req.headers['content-length'] || 'unknown';
                console.log(`📦 [Gateway] Body size: ${bodySize} bytes`);
            }
        },

        onProxyRes: (proxyRes, req, res) => {

            console.log(`✅ [Gateway] <- [${serviceName}]: ${proxyRes.statusCode} ${req.path}`);

            // Log response details
            if (proxyRes.statusCode >= 400) {
                console.error(`❌ [Gateway] Error response from ${serviceName}:`, {
                    status: proxyRes.statusCode,
                    path: req.path,
                    method: req.method
                });
            }

            // Set CORS headers on proxy response
            const origin = req.headers.origin;
            if (origin && ALLOWED_ORIGINS.includes(origin)) {
                proxyRes.headers['Access-Control-Allow-Origin'] = origin;
                proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
            }

            console.log(`[Gateway] <- [${serviceName}]: ${proxyRes.statusCode} ${req.path}`);

            // Track successful requests
            errorTracker.addRequest(serviceName);
        },

        onError: (err, req, res) => {
            console.error(`[Gateway] Proxy Error for ${serviceName}:`, {
                error: err.message,
                code: err.code,
                path: req.path,
                method: req.method
            });

            // Track errors
            errorTracker.addError({
                service: serviceName,
                method: req.method,
                url: req.originalUrl,
                status: 502,
                error: err.message,
                userId: req.user?.data?.user?._id || 'anonymous'
            });

            if (!res.headersSent) {
                const origin = req.headers.origin;
                if (origin && ALLOWED_ORIGINS.includes(origin)) {
                    res.setHeader('Access-Control-Allow-Origin', origin);
                    res.setHeader('Access-Control-Allow-Credentials', 'true');
                }
                res.status(502).json({
                    error: 'Bad Gateway',
                    message: `The service '${serviceName}' is currently unavailable.`,
                    code: err.code,
                    timestamp: new Date().toISOString()
                });
            }
        },

        // ⚠️ CRITICAL: Increase timeouts to prevent aborted requests
        timeout: 30000, // 30 seconds
        proxyTimeout: 30000, // 30 seconds

        // ⚠️ CRITICAL: Handle keep-alive properly
        agent: undefined, // Use default agent
        headers: {
            'Connection': 'keep-alive'
        }
    });
}

// 🔧 FIXED: Add body parsing middleware for gateway-specific routes only
// This prevents conflicts with proxy middleware
app.use('/api/gateway', express.json({ limit: '10mb' }));
app.use('/api/gateway', express.urlencoded({ extended: true, limit: '10mb' }));

// Gateway Health Endpoints
app.get('/api/gateway/health', async (req, res) => {
    try {
        const serviceHealth = await errorTracker.checkServiceHealth();
        const stats = errorTracker.getStats();

        const healthyServices = Object.values(serviceHealth).filter(s => s.status === 'healthy').length;
        const totalServices = Object.keys(serviceHealth).length;

        const overallStatus = healthyServices === totalServices ? 'healthy' :
            healthyServices > totalServices / 2 ? 'degraded' : 'critical';

        res.json({
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            services: serviceHealth,
            stats,
            version: '2.1.0'
        });
    } catch (error) {
        res.status(500).json({ error: 'Health check failed', message: error.message });
    }
});

app.get('/api/gateway/dashboard', async (req, res) => {
    try {
        const serviceHealth = await errorTracker.checkServiceHealth();
        const stats = errorTracker.getStats();

        const summary = {
            totalServices: Object.keys(serviceHealth).length,
            healthyServices: Object.values(serviceHealth).filter(s => s.status === 'healthy').length,
            offlineServices: Object.values(serviceHealth).filter(s => s.status === 'offline').length,
            services: serviceHealth,
            errorStats: stats,
            timestamp: new Date().toISOString()
        };

        summary.overallStatus = summary.healthyServices === summary.totalServices ? 'healthy' :
            summary.offlineServices > summary.healthyServices ? 'critical' : 'degraded';

        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Dashboard data failed', message: error.message });
    }
});

app.get('/api/gateway/errors', (req, res) => {
    const { limit = 50, service, status } = req.query;
    let errors = [...errorTracker.errors];

    if (service) errors = errors.filter(e => e.service === service);
    if (status) errors = errors.filter(e => e.status == status);

    res.json({
        errors: errors.reverse().slice(0, parseInt(limit)),
        total: errors.length,
        stats: errorTracker.getStats()
    });
});

app.delete('/api/gateway/errors', (req, res) => {
    if (req.query.confirm === 'true') {
        const clearedCount = errorTracker.errors.length;
        errorTracker.errors = [];
        errorTracker.serviceHealth = {};
        errorTracker.requestCount = 0;

        res.json({
            message: 'Error logs cleared',
            clearedCount,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            error: 'Add ?confirm=true to clear all error logs'
        });
    }
});

// Test route to verify gateway is working
app.get('/api/gateway/test', (req, res) => {
    console.log('🧪 Test route hit');
    res.json({
        message: 'Gateway is working!',
        timestamp: new Date().toISOString(),
        origin: req.headers.origin
    });
});

// 🔧 FIXED: Setup service routes with proper middleware order
Object.entries(SERVICES).forEach(([serviceName, config]) => {
    console.log(`🔧 Setting up routes for ${serviceName} -> ${config.url}`);

    if (serviceName === 'auth-service') {
        // Create a conditional auth middleware for auth-service
        const conditionalAuth = (req, res, next) => {
            // Skip auth for login, register, health
            const publicPaths = ['/login', '/register', '/health'];
            const isPublicPath = publicPaths.some(path => req.path.includes(path));

            if (isPublicPath) {
                console.log(`🔓 [${serviceName}] Public route: ${req.path}`);
                return next();
            }

            // Apply authentication for protected auth routes like /me, /protected
            console.log(`🔒 [${serviceName}] Protected route: ${req.path}`);
            return authenticate(req, res, next);
        };

        app.use(`/api/${serviceName}`, conditionalAuth, createServiceProxy(serviceName, config));
    } else {
        // Other services need authentication for all routes
        app.use(`/api/${serviceName}`, authenticate, createServiceProxy(serviceName, config));
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Gateway Error:', err);

    errorTracker.addError({
        service: 'gateway',
        method: req.method,
        url: req.originalUrl,
        status: 500,
        error: err.message,
        userId: req.user?.data?.user?._id || 'anonymous'
    });

    if (!res.headersSent) {
        res.status(500).json({
            error: 'Gateway error occurred',
            timestamp: new Date().toISOString()
        });
    }
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});

// Server startup
if (USE_HTTPS && fs.existsSync('./cert.pem') && fs.existsSync('./key.pem')) {
    const httpsOptions = {
        key: fs.readFileSync('./key.pem'),
        cert: fs.readFileSync('./cert.pem')
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`🚀 API Gateway running on HTTPS port ${PORT}`);
        console.log(`📊 Health: https://api.purple-pgs.space:${PORT}/api/gateway/health`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`🚀 API Gateway running on HTTP port ${PORT}`);
        console.log(`📊 Health: http://api.purple-pgs.space:${PORT}/api/gateway/health`);
        console.log(`🧪 Test: http://localhost:${PORT}/api/gateway/test`);
    });
}

// Graceful shutdown
const shutdown = () => {
    console.log('Gateway shutting down gracefully...');
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);