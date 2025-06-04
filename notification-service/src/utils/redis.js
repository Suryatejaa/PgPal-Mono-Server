// utils/redis.js
const { createClient } = require('redis');

const client = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    legacyMode: true // Use legacy mode for compatibility with existing code
});

client.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    await client.connect();
})();

module.exports = client;
