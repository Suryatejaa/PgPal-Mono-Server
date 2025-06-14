const { Server } = require('socket.io');
const Redis = require('ioredis');
const express = require('express');
require('dotenv').config();

// Create Express app for health checks
const app = express();
const server = require('http').createServer(app);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'websocket-gateway',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

const io = new Server(server, {
    cors: {
        origin: [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            process.env.FRONTEND_URL
        ],
        credentials: true
    }
});

const sub = new Redis(process.env.REDIS);

sub.subscribe('notifications', (err) => {
    if (err) console.error('Redis subscribe error:', err);
    else console.log('Subscribed to notifications channel');
});

sub.on('message', (channel, message) => {
    if (channel === 'notifications') {
        try {
            const notif = JSON.parse(message);
            // Emit to relevant clients (filter by tenantId, ownerId, etc.)
            if (notif.tenantId) {
                io.to(`tenant:${notif.tenantId}`).emit('notification', notif);
            }
            if (notif.ownerId) {
                io.to(`owner:${notif.ownerId}`).emit('notification', notif);
            }
        } catch (error) {
            console.error('Error parsing notification:', error);
        }
    }
});

io.on('connection', (socket) => {
    console.log('WebSocket client connected:', socket.id);

    // Client should join a room based on their userId and role
    socket.on('register', ({ userId, role }) => {
        if (userId && role) {
            socket.join(`${role}:${userId}`);
            console.log(`Client ${socket.id} joined room: ${role}:${userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('WebSocket client disconnected:', socket.id);
    });
});

server.listen(4011, () => {
    console.log('WebSocket Gateway running on port 4011');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        sub.disconnect();
        process.exit(0);
    });
});