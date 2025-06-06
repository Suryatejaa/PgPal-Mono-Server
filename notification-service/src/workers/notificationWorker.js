const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const Notification = require('../models/notificationModel');
const redis = require('../utils/redis'); // Use shared connection
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
    tlsAllowInvalidCertificates: false,
    serverSelectionTimeoutMS: 30000
})
    .then(() => console.log('✅ MongoDB connected in worker'))
    .catch((err) => console.error('❌ MongoDB connection error in worker:', err));

const worker = new Worker('notifications', async job => {
    try {
        console.log(`Processing job ${job.id} with data:`, job.data);

        const {
            tenantIds, tenantId, ownerId, propertyPpid, audience,
            title, message, type, method, createdBy, meta
        } = job.data;

        let notifications = [];

        if (Array.isArray(tenantIds)) {
            notifications = tenantIds.map(id => ({
                tenantId: id,
                propertyPpid,
                audience: audience || 'tenant',
                title,
                message,
                type,
                method,
                createdBy,
                meta
            }));
        } else if (tenantId) {
            notifications = [{
                tenantId,
                propertyPpid,
                audience: audience || 'tenant',
                title,
                message,
                type,
                method,
                createdBy,
                meta
            }];
        } else if (ownerId) {
            notifications = [{
                ownerId,
                propertyPpid,
                audience: audience || 'owner',
                title,
                message,
                type,
                method,
                createdBy,
                meta
            }];
        } else {
            throw new Error('No recipient specified in notification job');
        }

        // Save to database
        await Notification.insertMany(notifications);
        console.log(`[✅] Saved ${notifications.length} notifications to database`);

        // Publish to Redis
        for (const notif of notifications) {
            await redis.publish('notifications', JSON.stringify(notif));
        }
        console.log(`[✅] Published ${notifications.length} notifications to Redis`);

    } catch (err) {
        console.error(`Job ${job.id} failed with error:`, err);
        throw err;
    }
}, {
    connection: redis, // ✅ Fixed: Use the redis instance
    settings: {
        retries: 3,
    },
});

worker.on('completed', job => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job.id} failed`, err));

module.exports = worker;
