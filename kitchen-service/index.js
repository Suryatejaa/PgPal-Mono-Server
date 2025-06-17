const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const kitchenRoutes = require('./src/routes/kitchenRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const { scheduleNotifications } = require('./src/jobs/scheduleNotifications');
const ServiceHealthMonitor = require('../shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('kitchen-service', 4007);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4007;

// Middleware
app.use(express.json());

app.use(cookieParser());
app.use('/api/kitchen-service', kitchenRoutes);
app.use('/api/kitchen-service/monitor', monitorRoutes);


app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();
        
        // Add service-specific metrics
        const Kitchen = require('./src/models/kitchenMenuModel');
        const kitchenCount = await Kitchen.countDocuments();

        health.serviceMetrics = {
            totalKitchens: kitchenCount,
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


mongoose.connect(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: false,
})
    .then(() => {
        console.log('Connected to MongoDB');
        scheduleNotifications(); // Start the notification scheduling job
    })
    .catch(err => console.error('MongoDB connection error:', err));


// Routes
app.get('/', (req, res) => {
    res.send('Kitchen Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Kitchen Service is running on port ${PORT}`);
});
