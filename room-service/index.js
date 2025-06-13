const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
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
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http:localhost:5175'],
    credentials: true,
}));
app.use(cookieParser());
app.use('/api/room-service', roomRoutes);
app.use('/api/admin/room-service', adminRoutes);
app.use('/api/room-service/monitor', monitorRoutes);


// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
    tlsAllowInvalidCertificates: false,
})
    .then(() => console.log('Connected to MongoDB'));
// Routes
app.get('/', (req, res) => {
    res.send('Room Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Room Service is running on port ${PORT}`);
});