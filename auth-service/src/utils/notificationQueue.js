const { Queue } = require('bullmq');
const Redis = require('ioredis');

require('dotenv').config();

console.log(process.env.REDIS);
const connection = new Redis(process.env.REDIS);

const notificationQueue = new Queue('notifications', { connection });

module.exports = notificationQueue;
