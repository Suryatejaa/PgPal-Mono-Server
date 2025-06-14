const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const complainRoutes = require('./src/routes/complaintRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');



// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4006;

// Middleware
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http:localhost:5175'],
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
        'x-debug'
    ]
}));
app.use(cookieParser());
app.use('/api/complaint-service', complainRoutes);
app.use('/api/complaint-service/monitor', monitorRoutes);

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
    res.send('Complaint Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Complaint Service  is running on port ${PORT}`);
});
