// rent-service/index.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const paymentRoutes = require('./src/routes/paymentRoutes');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    tls: true,
    tlsAllowInvalidCertificates: false,
}).then(() => console.log('Rent Service - MongoDB Connected'))
    .catch((err) => console.log('Rent Service - MongoDB connection error', err));

// Routes - No CORS needed (gateway handles it)
app.use('/', paymentRoutes);  // Handles /update, /payments, etc.

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'rent-service',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'rent-service',
        status: 'running',
        endpoints: ['update', 'payments', 'history']
    });
});

const PORT = process.env.PORT || 4005;
app.listen(PORT, () => console.log(`Rent Service running on port ${PORT}`));