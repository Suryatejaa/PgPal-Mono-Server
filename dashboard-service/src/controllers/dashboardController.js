const { getTenantDocs, getOwnProperty, getVacates, getComplaintStats, getRoomDocs, getBedDocs, getCheckins } = require('./internalApis.js');
// const redis = require('../utils/redis.js'); // Adjust the path as needed
const CacheHelper = require('../utils/CacheHelper.js'); // Adjust the path as needed

exports.getOverview = async (req, res) => {
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = '/api' + req.originalUrl; // Always add /api

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const propertyId = ownerConfirmation._id.toString();
    try {

        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).json(cached);
            }
        }

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

        console.log(CacheHelper.isReady());
        console.log(cacheKey, response);
        if (CacheHelper.isReady()) {
            console.log(`first cacheKey: ${cacheKey}`);
            console.log(`first response: ${JSON.stringify(response)}`);
            await CacheHelper.set(cacheKey, response, 600);
        }
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getCheckins = async (req, res) => {
    //console.log('first');
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = '/api' + req.originalUrl; // Always add /api

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const pppid = req.params.propertyPpid;
    const period = req.query.period || 'week'; // 'week' or 'month'

    try {

        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).json(cached);
            }
        }

        const checkins = await getCheckins(pppid, period, JSON.parse(req.headers['x-user']));

        if (CacheHelper.isReady()) {
            await CacheHelper.set(cacheKey, checkins, 600);
        }
        res.json(checkins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getVacates = async (req, res) => {
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = '/api' + req.originalUrl; // Always add /api

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const period = req.query.period || 'week';
    let days;
    if (period === 'day') {
        days = 1; // Single day
    } else if (period === 'month') {
        days = 30; // Month
    } else {
        days = 7; // Week
    }
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {

        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).json(cached);
            }
        }
        //console.log('fromDate:', fromDate, propertyPpid);
        const vacates = await getVacates(propertyPpid, period, JSON.parse(req.headers['x-user']));

        if (CacheHelper.isReady()) {
            await CacheHelper.set(cacheKey, vacates, 600);
        }

        res.json(vacates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getComplaintStats = async (req, res) => {
    //console.log('first');
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const cacheKey = '/api' + req.originalUrl; // Always add /api
    //console.log(`Cache key in controller: ${cacheKey}`);

    const ownerConfirmation = await getOwnProperty(propertyPpid, currentUser, true);
    if (ownerConfirmation.ownerId.toString() !== id && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only access your own properties' });
    }
    const pppid = req.params.propertyPpid;

    try {

        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).json(cached);
            }
        }

        const stats = await getComplaintStats(pppid, JSON.parse(req.headers['x-user']));

        if (CacheHelper.isReady()) {
            await CacheHelper.set(cacheKey, stats, 600);
            //console.log(`Cache key in controller: ${cacheKey}`);

        }

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

