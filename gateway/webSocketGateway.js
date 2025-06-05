const { Server } = require('socket.io');
const Redis = require('ioredis');
require('dotenv').config();

const io = new Server(4011, { // Use a port not used by your HTTP gateway
    cors: {
        origin: 'http://localhost:5173', // Your React dev server
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
        const notif = JSON.parse(message);
        // Emit to relevant clients (filter by tenantId, ownerId, etc.)
        if (notif.tenantId) {
            io.to(`tenant:${notif.tenantId}`).emit('notification', notif);
        }
        if (notif.ownerId) {
            io.to(`owner:${notif.ownerId}`).emit('notification', notif);
        }
    }
});

io.on('connection', (socket) => {
    // Client should join a room based on their userId and role
    socket.on('register', ({ userId, role }) => {
        socket.join(`${role}:${userId}`);
    });
    console.log('WebSocket client connected:', socket.id);
});

console.log('WebSocket Gateway running on port 4011');
