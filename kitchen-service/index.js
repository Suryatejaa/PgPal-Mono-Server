const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const kitchenRoutes = require('./src/routes/kitchenRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');
const { scheduleNotifications } = require('./src/jobs/scheduleNotifications');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4007;

// Middleware
app.use(express.json());
// ...existing code...
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, curl)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            // Development origins
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:4000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:5175',
            'http://127.0.0.1:4000',

            // Production origins - CRITICAL FIX
            'https://purple-pgs.space',
            'https://www.purple-pgs.space',
            'https://api.purple-pgs.space',
            'https://owner.purple-pgs.space',
            'https://tenant.purple-pgs.space',
            'https://admin.purple-pgs.space',

            // Environment variable fallback
            process.env.FRONTEND_URL,
            process.env.CLIENT_URL
        ].filter(Boolean); // Remove undefined values

        console.log(`🌐 CORS Check - Origin: ${origin}, Allowed: ${allowedOrigins.includes(origin)}`);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`❌ CORS blocked origin: ${origin}`);
            callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cookie',
        'Set-Cookie',
        'x-user',
        'x-internal-service',
        'x-debug',
        'Connection',
        'Upgrade'
    ],
    exposedHeaders: [
        'Authorization',
        'Refresh-Token',
        'Set-Cookie'
    ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(cookieParser());
app.use('/api/kitchen-service', kitchenRoutes);
app.use('/api/kitchen-service/monitor', monitorRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
    tlsAllowInvalidCertificates: false,
})
    .then(() => {
        console.log('Connected to MongoDB');
        scheduleNotifications(); // Start the notification scheduling job
    })
    .catch(err => console.error('MongoDB connection error:', err));


// Routes
app.get('/', (req, res) => {
    res.send('Kitchen Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Kitchen Service is running on port ${PORT}`);
});
