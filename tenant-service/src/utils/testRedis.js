const Redis = require('ioredis');
require('dotenv').config();

async function testRedisConnection() {
    try {
        const redis = new Redis(process.env.REDIS, {
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
        });

        redis.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        redis.on('error', (err) => {
            console.error('❌ Redis connection error:', err.message);
        });

        // Test write operation
        await redis.set('test_key', 'test_value');
        console.log('✅ Test key written to Redis');

        // Test read operation
        const value = await redis.get('test_key');
        console.log('✅ Test key read from Redis:', value);

        // Check all keys
        const keys = await redis.keys('*');
        console.log('✅ All keys in Redis:', keys);

        // Clean up
        await redis.del('test_key');
        console.log('✅ Test key deleted');

        redis.disconnect();
    } catch (error) {
        console.error('❌ Redis test failed:', error.message);
    }
}

testRedisConnection();