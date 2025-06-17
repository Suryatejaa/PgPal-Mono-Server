const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const session = require('express-session');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
// const passport = require('./src/controllers/googleLogin');
const cookieParser = require('cookie-parser');
const ServiceHealthMonitor = require('./shared/utils/ServiceHealthMonitor');


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
// auth-service/app.js - Update MongoDB connection section
// MongoDB connection with health monitoring
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 2,
    tls: true,
    tlsAllowInvalidCertificates: false
}).then(() => {
    console.log('✅ MongoDB Connected');
    healthMonitor.markHealthy();
}).catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    healthMonitor.markUnhealthy('Database connection failed');
});

// Monitor MongoDB connection status
mongoose.connection.on('disconnected', () => {
    console.error('❌ MongoDB disconnected');
    healthMonitor.markUnhealthy('Database disconnected');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
    healthMonitor.markHealthy();
});

mongoose.connection.on('error', (error) => {
    console.error('❌ MongoDB error:', error);
    healthMonitor.markUnhealthy(`Database error: ${error.message}`);
});

app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'auth-service',
        status: 'healthy',
        port: 4001,
        uptime: Math.floor(process.uptime()),
        database: {
            status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            readyState: mongoose.connection.readyState
        },
        timestamp: new Date().toISOString()
    });
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
app.use('/', authRoutes);  // For gateway requests
app.use('/admin', adminRoutes);
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
