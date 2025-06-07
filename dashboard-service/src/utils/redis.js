const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS);

redis.on('connect', () => {
    console.log('Redis connected successfully');
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redis.on('ready', () => {
    console.log('Redis is ready for use');
});

module.exports = redis;
