const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const propertyRoutes = require('./src/routes/propertyRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const simpleAdminRoutes = require('./src/routes/simpleAdminRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const ServiceHealthMonitor = require('../shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('property-service', 4002);


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4002;

// Middleware
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

app.use(cookieParser());

// Test simple admin routes first
console.log('🔧 Registering simple admin routes at /simple-admin');
app.use('/simple-admin', simpleAdminRoutes);



// Mount general property routes
app.use('/api/property-service', propertyRoutes);
app.use('/api/property-service/admin', adminRoutes);
app.use('/api/property-service/monitor', monitorRoutes);

app.get('/admin-test', (req, res) => {
    console.log('🧪 Admin test route accessed');
    res.json({
        message: 'Admin test route working!',
        timestamp: new Date(),
        success: true
    });
});


// property-service/index.js

// Add the same health endpoints and monitoring as auth-service
app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();

        // Add service-specific metrics
        const Property = require('./src/models/propertyModel');
        const propertyCount = await Property.countDocuments();

        health.serviceMetrics = {
            totalProperties: propertyCount,
            // Add more service-specific metrics
        };

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        res.status(503).json({
            service: 'property-service',
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Add ready and live endpoints...

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: false,
    serverSelectionTimeoutMS: 10000 // Increase timeout to 30s
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

app.get('/', (req, res) => {
    res.send('Property Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Property Service is running on port ${PORT}`);
});
