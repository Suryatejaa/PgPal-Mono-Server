// rent-service/index.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const paymentRoutes = require('./src/routes/paymentRoutes');
const ServiceHealthMonitor = require('../shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('rent-service', 4005);

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());


app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();
        
        // Add service-specific metrics
        const Tenant = require('./src/models/tenantModel');
        const tenantCount = await Tenant.countDocuments();

        health.serviceMetrics = {
            totalRent: tenantCount,
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
    serverSelectionTimeoutMS: 10000,
    tls: true,
    tlsAllowInvalidCertificates: false,
}).then(() => console.log('Rent Service - MongoDB Connected'))
    .catch((err) => console.log('Rent Service - MongoDB connection error', err));

// Routes - No CORS needed (gateway handles it)
app.use('/api/rent-service', paymentRoutes);  // Handles /update, /payments, etc.

// Health check
const PORT = process.env.PORT || 4005;
app.listen(PORT, () => console.log(`Rent Service running on port ${PORT}`));