const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const roomRoutes = require('./src/routes/roomRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4003;

// Middleware

app.use(express.json());

app.use(cookieParser());
app.use('/api/room-service', roomRoutes);
app.use('/api/room-service/admin', adminRoutes);
app.use('/api/room-service/monitor', monitorRoutes);
// app.use('/', roomRoutes);
// app.use('/admin', adminRoutes);
// app.use('/monitor', monitorRoutes);


// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: false,
})
    .then(() => console.log('Connected to MongoDB'));

// Routes
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'room-service' });
});
app.get('/', (req, res) => {
    res.send('Room Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Room Service is running on port ${PORT}`);
});