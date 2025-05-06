const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
    maxRetriesPerRequest: null
});

const notificationQueue = new Queue('notifications', { connection });

module.exports = notificationQueue;
