const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const roomRoutes = require('./src/routes/roomRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const ServiceHealthMonitor = require('../shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('room-service', 4003);


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4003;

// Middleware

app.use(express.json());

app.use(cookieParser());
app.use('/api/room-service', roomRoutes);
app.use('/api/room-service/admin', adminRoutes);
app.use('/api/room-service/monitor', monitorRoutes);

// property-service/index.js

// Add the same health endpoints and monitoring as auth-service
app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();
        
        // Add service-specific metrics
        const Room = require('./src/models/roomModel');
        const roomCount = await Room.countDocuments();

        health.serviceMetrics = {
            totalRooms: roomCount,
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

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: false,
})
    .then(() => console.log('Connected to MongoDB'));


app.get('/', (req, res) => {
    res.send('Room Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Room Service is running on port ${PORT}`);
});