const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
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
// ...existing code...
app.use(cors({
    origin: [
        'http://localhost:5173', 
        'http://localhost:5174', 
        'http://localhost:5175',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174', 
        'http://127.0.0.1:5175',
        'ws://localhost:4011',
        'ws://127.0.0.1:4011'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'x-user',
        'x-internal-service',
        'x-debug',
        'Connection',
        'Upgrade'
    ]
}));
// ...existing code...

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
app.use('/api/admin/property-service', adminRoutes);
app.use('/api/property-service/monitor', monitorRoutes);

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
app.get('/', (req, res) => {
    res.send('Property Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Property Service is running on port ${PORT}`);
});
