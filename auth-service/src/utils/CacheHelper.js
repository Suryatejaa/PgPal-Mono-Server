// src/utils/cacheHelper.js
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
                console.log('Cached data:', cached);
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

    static getStatus() {
        return {
            status: redisClient.status,
            ready: this.isReady()
        };
    }
}

module.exports = CacheHelper;