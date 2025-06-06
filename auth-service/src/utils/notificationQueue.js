// notificationQueue.js - Fixed
const { Queue } = require('bullmq');
const redis = require('./redis'); // Use shared connection

const notificationQueue = new Queue('notifications', {
    connection: redis
});

module.exports = notificationQueue;