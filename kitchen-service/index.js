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
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http:localhost:5175'],
    credentials: true,
}));
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
