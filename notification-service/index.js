const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const notificationRoutes = require('./src/routes/notificationRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const ServiceHealthMonitor = require('./shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('notification-service', 4009);


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4009;

// Middleware
app.use(express.json());

app.use(cookieParser());
app.use('/', notificationRoutes);
app.use('/monitor', monitorRoutes);

// property-service/index.js

// Add the same health endpoints and monitoring as auth-service
app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();

        // Add service-specific metrics
        const Notification = require('./src/models/notificationModel');
        const notificationCount = await Notification.countDocuments();

        health.serviceMetrics = {
            totalNotifications: notificationCount,
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
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30s
    tls: true,
    tlsAllowInvalidCertificates: false,
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

// Routes
app.get('/', (req, res) => {
    res.send('Notification Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Notification Service is running on port ${PORT}`);
});
