const redisClient = require('./redis');

const cacheMiddleware = async (req, res, next) => {
    const key = req.originalUrl; // Use the request URL as the cache key

    try {
        const cachedData = await redisClient.get(key);
        if (cachedData) {
            // If data is found in cache, return it
            return res.status(200).json(JSON.parse(cachedData));
        }
        next(); // Proceed to the controller if no cache is found
    } catch (err) {
        console.error('Redis Cache Error:', err);
        next(); // Proceed even if Redis fails
    }
};

module.exports = cacheMiddleware;