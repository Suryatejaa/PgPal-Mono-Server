const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const tenantRoutes = require('./src/routes/tenantRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const VacateTenantsJob = require('./src/jobs/vacateTenantsJob');
const JobScheduler = require('./src/jobs/JobScheduler');
const RentReminderJob = require('./src/jobs/RentReminderJob');
const ServiceHealthMonitor = require('./shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('tenant-service', 4004);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4004;

// Middleware
app.use(express.json());
app.use(cookieParser());

// Start the vacate tenants job
const jobScheduler = new JobScheduler();
jobScheduler.startAllJobs();


app.use('/api/tenant-service', tenantRoutes);
app.use('/api/tenant-service/monitor', monitorRoutes);

app.post('/api/tenant-service/manual-vacate-job', async (req, res) => {
    try {
        const result = await jobScheduler.runJob('VacateTenantsJob');
        res.status(200).json({
            message: 'Manual vacate job executed successfully',
            result
        });
    } catch (error) {
        res.status(500).json({
            error: 'Manual vacate job failed',
            details: error.message
        });
    }
});

app.post('/debug/hello-job', async (req, res) => {
    try {
        const result = await jobScheduler.runJob('HelloWorldJob');
        res.json({ success: true, result });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.post('/api/tenant-service/debug/remind-tenant/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const rentReminderJob = new RentReminderJob();
        const result = await rentReminderJob.runForTenant(tenantId);

        res.json({
            success: true,
            tenantId,
            result: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// property-service/index.js

// Add the same health endpoints and monitoring as auth-service
app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();

        // Add service-specific metrics
        const Tenant = require('./src/models/tenantModel');
        const tenantCount = await Tenant.countDocuments();

        health.serviceMetrics = {
            totalTenants: tenantCount,
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
})
    .then(() => console.log('Connected to MongoDB'));

app.get('/', (req, res) => {
    res.send('Tenant Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Tenant Service is running on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    jobScheduler.stopAllJobs();
    process.exit(0);
});