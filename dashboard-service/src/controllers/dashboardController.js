const { getTenantDocs, getOwnProperty, getVacates, getComplaintStats, getRoomDocs, getBedDocs, getCheckins } = require('./internalApis.js');
const redisClient = require('../utils/redis.js'); // Adjust the path as needed

exports.getOverview = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = req.originalUrl;

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const propertyId = ownerConfirmation._id.toString();
    try {
        const tenants = await getTenantDocs(propertyPpid, currentUser);
        const rooms = await getRoomDocs(propertyId, currentUser);

        const beds = await getBedDocs(propertyId, currentUser);

        const stats = beds[0] || { totalBeds: 0, occupiedBeds: 0 };
        const occupancy = stats.totalBeds > 0
            ? Math.round((stats.occupiedBeds / stats.totalBeds) * 100)
            : 0;

        const response = {
            tenants,
            rooms,
            totalBeds: stats.totalBeds,
            occupiedBeds: stats.occupiedBeds,
            occupancy: `${occupancy}%`
        };
        if (redisClient.isReady) {
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 600 });
        }
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getCheckins = async (req, res) => {
    console.log('first');
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = req.originalUrl;

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const pppid = req.params.propertyPpid;
    const period = req.query.period || 'week'; // 'week' or 'month'

    try {
        const checkins = await getCheckins(pppid, period, JSON.parse(req.headers['x-user']));

        if (redisClient.isReady) {
            await redisClient.set(cacheKey, JSON.stringify(checkins), { EX: 600 });
        }
        res.json(checkins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getVacates = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = req.originalUrl;

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const { pppid } = req.params;
    const period = req.query.period || 'week';
    const days = period === 'month' ? 30 : 7;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
        const vacates = await getVacates(pppid, period, JSON.parse(req.headers['x-user']));

        if (redisClient.isReady) {
            await redisClient.set(cacheKey, JSON.stringify(vacates), { EX: 600 });
        }

        res.json(vacates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getComplaintStats = async (req, res) => {
    console.log('first');
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = req.originalUrl;
    console.log(`Cache key in controller: ${cacheKey}`);

    // In getComplaintStats method
    if (!redisClient.isReady) {
        console.error('Redis client is not ready');
        return next(); // Proceed without caching
    }

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const pppid = req.params.propertyPpid;

    try {
        const stats = await getComplaintStats(pppid, JSON.parse(req.headers['x-user']));

        if (!redisClient.isReady) {
            console.error('Redis client is not ready');
            return next(); // Proceed without caching
        }
        if (redisClient.isReady) {
            await redisClient.set(cacheKey, JSON.stringify(stats), { EX: 600 });
            console.log(`Cache key in controller: ${cacheKey}`);

        }

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

