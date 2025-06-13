const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4008;

// Middleware
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http:localhost:5175'],
    credentials: true,
}));
app.use(cookieParser());
app.use('/api/dashboard-service', dashboardRoutes);
app.use('/api/dashboard-service/monitor', monitorRoutes);

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
