const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const session = require('express-session');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const passport = require('./src/controllers/googleLogin');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(session({ secret: 'your-session-secret', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000, // Increase timeout to 30s
    tls: true,
    tlsAllowInvalidCertificates: false, // Allow invalid certificates for local development
}).then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

// Routes
app.use('/api/auth-service', authRoutes);  // For gateway requests
app.use('/api/auth-service/admin', adminRoutes);
// app.use('/', authRoutes);                  // For direct requests
// app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'auth-service',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));