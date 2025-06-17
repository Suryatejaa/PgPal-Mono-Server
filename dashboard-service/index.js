const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4008;

// Middleware
app.use(express.json());
// ...existing code...
// ...existing code...
app.use(cookieParser());
app.use('/api/dashboard-service', dashboardRoutes);
app.use('/', dashboardRoutes);
app.use('/api/dashboard-service/monitor', monitorRoutes);
app.use('/monitor', monitorRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000, // Increase timeout to 30s
    tls: true,
    tlsAllowInvalidCertificates: false,
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

// Health check route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'dashboard-service' });
});

// Routes
app.get('/', (req, res) => {
    res.send('Dashboard Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Dashboard Service is running on port ${PORT}`);
});
