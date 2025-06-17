const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const complainRoutes = require('./src/routes/complaintRoutes');
const monitorRoutes = require('./src/routes/monitoringRoutes');
const cookieParser = require('cookie-parser');



// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4006;

// Middleware
app.use(express.json());

app.use(cookieParser());
app.use('/api/complaint-service', complainRoutes);
app.use('/api/complaint-service/monitor', monitorRoutes);
// app.use('/', complainRoutes);
// app.use('/monitor', monitorRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: false,
})
    .then(() => console.log('Connected to MongoDB'));

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'complaint-service' });
});

// Routes
app.get('/', (req, res) => {
    res.send('Complaint Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Complaint Service  is running on port ${PORT}`);
});
