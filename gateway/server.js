const express = require('express');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
// CORS Middleware

app.use(cors({

    origin: 'http://localhost:5173', // Replace with your frontend URL

    credentials: true, // Allow cookies to be sent

}));

// Logging middleware

app.use((req, res, next) => {

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);

    next();

});

app.use(cookieParser());


const authenticate = async (req, res, next) => {
    
    if (req.headers['x-internal-service']) {
        return next(); 
    }

    const token = req.cookies.token
    if (!token) {
        return res.status(401).json({ message: 'Missing token' });
    }
    console.log('Token from cookies:', token);
    try {
        const response = await axios.post('http://localhost:4001/api/auth-service/protected', {}, {
            headers: {
                Authorization: `Bearer ${token}`, 
            },
            withCredentials: true, 
        });
        if (response.status === 200) {
            req.user = { data: response.data, token };
            return next();
        } else {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    } catch (error) {
        console.error('Error during authentication:', error.response?.data || error.message);
        return res.status(500).json({ error: error.response?.data || 'Internal Server Error' });
    }
};

// Proxy for auth-service


function attachUserHeader(req, res, next) {
    if (req.headers['x-internal-service']) return next();
    if (req.user) {
        req.headers['x-user'] = JSON.stringify(req.user);
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Missing user context' });
}

app.use('/api/auth-service', 
    createProxyMiddleware({
        target: 'http://localhost:4001',
        changeOrigin: true,
    })
);

app.use('/api/property-service', authenticate, attachUserHeader,
    createProxyMiddleware({
        target: 'http://localhost:4002',
        changeOrigin: true,
    }));

app.use('/api/room-service', authenticate, attachUserHeader,
    createProxyMiddleware({
        target: 'http://localhost:4003',
        changeOrigin: true,
    }));

app.use('/api/tenant-service', authenticate, attachUserHeader,
    createProxyMiddleware({
        target: 'http://localhost:4004', // Updated target
        changeOrigin: true,
    }));

app.use('/api/payment-service', authenticate, attachUserHeader,   
    createProxyMiddleware({
        target: 'http://localhost:4005',
        changeOrigin: true,
    }));

app.use('/api/complaint-service', authenticate, attachUserHeader,
    createProxyMiddleware({
        target: 'http://localhost:4006', // Updated target
        changeOrigin: true,
    }));
// Start the API Gateway

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {

    console.log(`API Gateway running on port ${PORT}`);

});