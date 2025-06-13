const redisClient = require('./redis');

class CacheHelper {
    static isReady() {
        return redisClient.status === 'ready';
    }

    static async get(key) {
        if (!this.isReady()) {
            console.log('Redis not ready, skipping cache read');
            return null;
        }

        try {
            const cached = await redisClient.get(key);
            if (cached) {
                console.log('Cache hit:', key);
                return JSON.parse(cached);
            }
            console.log('Cache miss:', key);
            return null;
        } catch (error) {
            console.error('Cache read error:', error.message);
            return null;
        }
    }

    static async set(key, data, ttl = 300) {
        if (!this.isReady()) {
            console.log('Redis not ready, skipping cache write');
            return false;
        }

        try {
            await redisClient.set(key, JSON.stringify(data), 'EX', ttl);
            console.log('Cache set:', key);
            return true;
        } catch (error) {
            console.error('Cache write error:', error.message);
            return false;
        }
    }

    // ✅ Added missing scan method
    static async scan(cursor, options = {}) {
        if (!this.isReady()) {
            console.log('Redis not ready, skipping cache scan');
            return { cursor: '0', keys: [] };
        }

        try {
            const args = [cursor];

            if (options.MATCH) {
                args.push('MATCH', options.MATCH);
            }

            if (options.COUNT) {
                args.push('COUNT', options.COUNT);
            }

            const result = await redisClient.scan(...args);

            return {
                cursor: result[0],
                keys: result[1] || []
            };
        } catch (error) {
            console.error('Cache scan error:', error.message);
            return { cursor: '0', keys: [] };
        }
    }

    // ✅ Added missing del method
    static async del(keys) {
        if (!this.isReady()) {
            console.log('Redis not ready, skipping cache deletion');
            return 0;
        }

        try {
            if (!keys || keys.length === 0) {
                return 0;
            }

            // Handle both single key and array of keys
            const keysArray = Array.isArray(keys) ? keys : [keys];
            const result = await redisClient.del(...keysArray);

            console.log(`Cache deleted: ${result}/${keysArray.length} keys`);
            return result;
        } catch (error) {
            console.error('Cache delete error:', error.message);
            return 0;
        }
    }

    // ✅ Added method to delete all keys matching pattern (alternative approach)
    static async deleteByPattern(pattern) {
        if (!this.isReady()) {
            console.log('Redis not ready, skipping pattern deletion');
            return 0;
        }

        try {
            let cursor = '0';
            let totalDeleted = 0;

            do {
                const scanResult = await this.scan(cursor, { MATCH: pattern, COUNT: 100 });
                cursor = scanResult.cursor;

                if (scanResult.keys.length > 0) {
                    const deleted = await this.del(scanResult.keys);
                    totalDeleted += deleted;
                }
            } while (cursor !== '0');

            return totalDeleted;
        } catch (error) {
            console.error('Pattern delete error:', error.message);
            return 0;
        }
    }

    // ✅ Added method to check if key exists
    static async exists(key) {
        if (!this.isReady()) {
            return false;
        }

        try {
            const result = await redisClient.exists(key);
            return result === 1;
        } catch (error) {
            console.error('Cache exists check error:', error.message);
            return false;
        }
    }

    // ✅ Added method to get all keys matching pattern
    static async keys(pattern) {
        if (!this.isReady()) {
            return [];
        }

        try {
            const keys = await redisClient.keys(pattern);
            return keys || [];
        } catch (error) {
            console.error('Cache keys error:', error.message);
            return [];
        }
    }

    // ✅ Enhanced status method
    static getStatus() {
        const status = {
            status: redisClient.status,
            ready: this.isReady(),
            uptime: redisClient.uptime || 0,
            connectedAt: redisClient.connectedAt || null
        };

        return status;
    }

    // ✅ Added method to clear all cache
    static async flushAll() {
        if (!this.isReady()) {
            console.log('Redis not ready, skipping flush');
            return false;
        }

        try {
            await redisClient.flushall();
            console.log('All cache cleared');
            return true;
        } catch (error) {
            console.error('Cache flush error:', error.message);
            return false;
        }
    }
}

module.exports = CacheHelper;