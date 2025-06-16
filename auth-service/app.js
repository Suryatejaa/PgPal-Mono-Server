const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const session = require('express-session');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const passport = require('./src/controllers/googleLogin');
const cookieParser = require('cookie-parser');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(session({ secret: 'your-session-secret', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
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


// ...existing code...

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000, // Increase timeout to 30s
    tls: true,
    tlsAllowInvalidCertificates: false, // Allow invalid certificates for local development
}).then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

// Routes
app.use('/api/auth-service', authRoutes);
app.use('/api/auth-service/admin', adminRoutes);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));