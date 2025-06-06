const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,    // Optional: Ensures Redis is ready before connecting
});

redis.on('connect', () => {
    console.log('Redis connected successfully');
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

module.exports = redis;
