const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4008;

// Middleware
app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use('/api/dashboard-service', dashboardRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {   
    serverSelectionTimeoutMS: 10000 // Increase timeout to 30s
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDb connection error', err));

// Routes
app.get('/', (req, res) => {
    res.send('Dashboard Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Dashboard Service is running on port ${PORT}`);
});
