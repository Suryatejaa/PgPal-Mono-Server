const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const propertyRoutes = require('./src/routes/propertyRoutes');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4002;

// Middleware
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));
app.use(cookieParser());
app.use('/api/property-service', propertyRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000 // Increase timeout to 30s
}
)
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.log('MongoDB connection error', err));

// Routes
app.get('/', (req, res) => {
    res.send('Property Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Property Service is running on port ${PORT}`);
});
