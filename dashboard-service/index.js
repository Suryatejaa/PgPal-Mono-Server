const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const ServiceHealthMonitor = require('./shared/utils/ServiceHealthMonitor');
const healthMonitor = new ServiceHealthMonitor('dashboard-service', 4008);


dotenv.config();

const app = express();
const PORT = process.env.PORT || 4008;


app.use(express.json());

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

app.use(cookieParser());
app.use('/', dashboardRoutes);
app.use('/monitor', monitorRoutes);



app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.getHealth();

        // Add service-specific metrics
        const Dashboard = require('./src/models/dashboardModel');
        const dashboardCount = await Dashboard.countDocuments();

        health.serviceMetrics = {
            totalDashboards: dashboardCount,
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
    serverSelectionTimeoutMS: 10000, // Increase timeout to 30s
    tls: true,
    tlsAllowInvalidCertificates: false,
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));


// Routes
app.get('/', (req, res) => {
    res.send('Dashboard Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Dashboard Service is running on port ${PORT}`);
});
