const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const session = require('express-session');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
// const passport = require('./src/controllers/googleLogin');
const cookieParser = require('cookie-parser');
const ServiceHealthMonitor = require('../shared/utils/ServiceHealthMonitor');


dotenv.config();

const app = express();

const healthMonitor = new ServiceHealthMonitor('auth-service', 4001);


app.use(express.json());
app.use(cookieParser());
app.use(session({ secret: 'your-session-secret', resave: false, saveUninitialized: true }));
// app.use(passport.initialize());
// app.use(passport.session());


app.use((req, res, next) => {
    healthMonitor.trackRequest();

    const originalSend = res.send;
    res.send = function (data) {
        if (res.statusCode >= 400) {
            healthMonitor.trackError();
        }
        originalSend.call(this, data);
    };
    next();
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000, // Increase timeout to 30s
    tls: true,
    tlsAllowInvalidCertificates: false, // Allow invalid certificates for local development
}).then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));


app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        res.status(503).json({
            service: 'auth-service',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Ready check for container orchestration
app.get('/ready', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();
        if (health.database.status === 'connected') {
            res.json({ status: 'ready', service: 'auth-service' });
        } else {
            res.status(503).json({ status: 'not ready', reason: 'Database not connected' });
        }
    } catch (error) {
        res.status(503).json({ status: 'not ready', error: error.message });
    }
});

// Live check
app.get('/live', (req, res) => {
    res.json({
        status: 'alive',
        service: 'auth-service',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});


// Routes
app.use('/api/auth-service', authRoutes);  // For gateway requests
app.use('/api/auth-service/admin', adminRoutes);
// app.use('/', authRoutes);                  // For direct requests
// app.use('/admin', adminRoutes);

// Global error handler
app.use((error, req, res, next) => {
    console.error('Auth Service Error:', error);
    healthMonitor.trackError();

    res.status(500).json({
        error: 'Internal server error',
        service: 'auth-service',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 4001;
const server = app.listen(PORT, () => {
    console.log(`🚀 Auth Service running on port ${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 Auth Service shutting down...');
    server.close(() => {
        mongoose.connection.close();
        process.exit(0);
    });
});
