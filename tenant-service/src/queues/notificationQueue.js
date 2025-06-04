const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
    host: process.env.UPSTASH_REDIS_REST_URL,
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    legacyMode: true, // Use legacy mode for compatibility with existing code
    maxRetriesPerRequest: null
});

const notificationQueue = new Queue('notifications', { connection });

module.exports = notificationQueue;
