const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const propertyRoutes = require('./src/routes/propertyRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const simpleAdminRoutes = require('./src/routes/simpleAdminRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');


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
app.use('/', propertyRoutes);
app.use('/api/property-service/admin', adminRoutes);
app.use('/admin', adminRoutes);
app.use('/api/property-service/monitor', monitorRoutes);
app.use('/monitor', monitorRoutes);

// Simple admin test route for debugging
app.get('/admin-test', (req, res) => {
    console.log('🧪 Admin test route accessed');
    res.json({
        message: 'Admin test route working!',
        timestamp: new Date(),
        success: true
    });
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: false,
    serverSelectionTimeoutMS: 10000 // Increase timeout to 30s
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

// Routes
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'property-service' });
});
app.get('/', (req, res) => {
    res.send('Property Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Property Service is running on port ${PORT}`);
});
