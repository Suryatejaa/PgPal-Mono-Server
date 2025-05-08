const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(
    process.env.REDIS_URL || 'redis://redis:6379',
    {
        maxRetriesPerRequest: null
    });

const notificationQueue = new Queue('notifications', { connection });

module.exports = notificationQueue;
