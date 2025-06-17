const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const complainRoutes = require('./src/routes/complaintRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const ServiceHealthMonitor = require('../shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('complaint-service', 4006);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4006;

// Middleware
app.use(express.json());

app.use(cookieParser());
app.use('/api/complaint-service', complainRoutes);
app.use('/api/complaint-service/monitor', monitorRoutes);
// app.use('/', complainRoutes);
// app.use('/monitor', monitorRoutes);


app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();

        // Add service-specific metrics
        const Complaint = require('./src/models/complainsModel');
        const complaintCount = await Complaint.countDocuments();

        health.serviceMetrics = {
            totalComplaints: complaintCount,
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

// Routes
app.get('/', (req, res) => {
    res.send('Complaint Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Complaint Service  is running on port ${PORT}`);
});
