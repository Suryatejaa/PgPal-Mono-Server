const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cors = require('cors');
const roomRoutes = require('./src/routes/roomRoutes');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4003;

// Middleware
app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use('/api/room-service', roomRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB'));


// Routes
app.get('/', (req, res) => {
    res.send('Room Service is running');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Room Server is running on port ${PORT}`);
});
