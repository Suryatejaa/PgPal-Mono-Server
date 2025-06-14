const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const notificationRoutes = require('./src/routes/notificationRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4009;

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
app.use(cookieParser());
app.use('/api/notification-service', notificationRoutes);
app.use('/api/notification-service/monitor', monitorRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30s
    tls: true,
    tlsAllowInvalidCertificates: false,
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

// Routes
app.get('/', (req, res) => {
    res.send('Notification Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Notification Service is running on port ${PORT}`);
});
