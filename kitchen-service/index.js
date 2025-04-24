const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const kitchenRoutes = require('./src/routes/kitchenRoutes');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4007;

// Middleware
app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use('/api/kitchen-service', kitchenRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));


// Routes
app.get('/', (req, res) => {
    res.send('Kitchen Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Kitchen Service is running on port ${PORT}`);
});
