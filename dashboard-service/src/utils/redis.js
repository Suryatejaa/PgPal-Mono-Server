// utils/redis.js
const { createClient } = require('redis');

const client = createClient({
    url: process.env.REDIS_URL || 'redis://redis:6379'
});

client.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    await client.connect();
})();

module.exports = client;
