const redisClient = require('../utils/redis');

const invalidateCacheByPattern = async (pattern) => {
    try {
        let cursor = '0';
        const keys = [];


        do {
            const scanResult = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
            cursor = scanResult.cursor;
            const foundKeys = scanResult.keys;
            keys.push(...foundKeys);
        } while (cursor !== 0);

        //console.log(`Keys found for pattern "${pattern}":`, keys);

        if (keys.length > 0) {
            // Delete all matching keys
            await redisClient.del(keys);
            //console.log('Deleted keys:', keys);
        } else {
            //console.log('No matching keys found for pattern:', pattern);
        }
    } catch (err) {
        console.error('Error invalidating cache:', err.message);
    }
};

module.exports = invalidateCacheByPattern;