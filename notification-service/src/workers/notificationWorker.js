const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const Notification = require('../models/notificationModel');
const Redis = require('ioredis');
const dotenv = require('dotenv');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('Current working directory:', process.cwd());
console.log('MONGO_URI from .env:', process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000 // Increase timeout to 30s
})
    .then(() => console.log('✅ MongoDB connected in worker'))
    .catch((err) => console.error('❌ MongoDB connection error in worker:', err));


const connection = new Redis(
    process.env.REDIS_URL || 'redis://redis:6379',
    {
        maxRetriesPerRequest: null
    }
);


connection.on('connect', () => console.log('Redis connected successfully'));
connection.on('error', (err) => console.error('Redis connection error:', err));


const worker = new Worker('notifications', async job => {
    try {
        console.log(`Processing job ${job.id} with data:`, job.data);

        const { tenantIds, propertyPpid, title, message, type, method, createdBy } = job.data;

        const notifications = tenantIds.map((tenantId) => ({
            tenantId,
            propertyPpid,
            title,
            message,
            type,
            method,
            createdBy,
        }));

        await Notification.insertMany(notifications);
        console.log(`[✅] Sent ${notifications.length} notifications`);
    } catch (err) {
        console.error(`Job ${job.id} failed with error:`, err);
        throw err; // Re-throw the error to allow retries
    }
}, {
    connection,
    settings: {
        retries: 3, // Retry the job 3 times
    },
});

worker.on('completed', job => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job.id} failed`, err));
