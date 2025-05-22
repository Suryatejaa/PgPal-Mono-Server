const Tenant = require('../models/tenantModel');
const Vacates = require('../models/vacatesModel');
const { getOwnProperty } = require('./internalApis'); // Assuming you have a function to generate PPT IDs
const redisClient = require('../utils/redis');
const refreshRentForBilling = require('../utils/refreshRent');

// ✅ Get all tenants (owned or added by this PG owner)
exports.getTenants = async (req, res) => {
    try {
        const currentUser = JSON.parse(req.headers['x-user']);
        const role = currentUser.data.user.role;
        const ownerid = currentUser.data.user._id;

        let tenants;
        if (role === 'owner') {
            tenants = await Tenant.find({ createdBy: currentUser.data.user._id });
        } else {
            tenants = await Tenant.find(); // For admin role or future use
        }

        const cacheKey = '/api' + req.originalUrl; // Always add /api
        await redisClient.set(cacheKey, JSON.stringify(tenants), { EX: 300 });

        res.status(200).json(tenants);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ✅ Get tenant by ID
exports.getTenantByQuery = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid; //tenantID
    const _id = req.query.id;
    const status = req.query.status;
    const propertyId = req.query.propertyId;

    console.log('called with ', phone || pgpalId || _id || status || propertyId);

    const query = {
        $or: [
            phone ? { phone } : null,
            pgpalId ? { pgpalId } : null,
            _id ? { _id } : null,
            status ? { status } : null,
            propertyId ? { "currentStay.propertyPpid": propertyId } : null
        ].filter(Boolean) // Remove null values
    };

    const cacheKey = '/api' + req.originalUrl; // Always add /api
    try {
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }
        const tenants = await Tenant.find(query);

        if (!tenants || tenants.length === 0) return res.status(404).json({ error: 'Tenant not found' });
        console.log(tenants.map(t => t.pgpalId));

        const refreshedCurrentStays = tenants.map(t => refreshRentForBilling(t.currentStay));

        const responses = tenants.map((tenant, index) => ({
            name: tenant.name,
            pgpalId: tenant.pgpalId,
            phone: tenant.phone,
            aadhar: tenant.aadhar,
            status: tenant.status,
            In_Notice_Period: tenant.isInNoticePeriod,
            currentStay: refreshedCurrentStays[index],
            addedBy: tenant.createdBy,
            stayHistory: tenant.stayHistory ? tenant.stayHistory : null
        }));

        await redisClient.set(cacheKey, JSON.stringify(responses), { EX: 300 });

        res.status(200).json(responses);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantByPhNum = async (req, res) => {

    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const phone = req.params.phnum;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    console.log(phone);
    try {
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }
        const tenant = await Tenant.find({ phone });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);

        await redisClient.set(cacheKey, JSON.stringify(ppId[0]), { EX: 300 });

        console.log('tenant: ', tenant);
        console.log('ppid: ', ppId);
        res.status(200).json(ppId[0]);
    } catch (err) {
        console.log(err.message);
        res.status(400).json({ message: err.message });
    }
};

exports.getTenantStayStatus = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid; //tenantID
    const _id = req.query.id;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    try {
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const response = { currentStay: tenant[0].currentStay };
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getMyStay = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const pgpalId = currentUser.data.user.pgpalId;
    const _id = currentUser.data.user._id;
    const cacheKey = '/api' + req.originalUrl; // Always add /api
    if (role !== 'tenant') return res.status(403).json({ error: 'Forbidden, Access denied' });

    console.log('currentUser:', currentUser);
    try {

        const tenant = await Tenant.find({ $or: [{ phone: currentUser.data.user.phoneNumber }, { pgpalId }, { _id }] });
        console.log('tenant:', tenant);
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const response = { currentStay: tenant[0].currentStay };
        console.log('response:', response);
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantHistory = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    const _id = req.query.id;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    try {
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const response = tenant[0].stayHistory;
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};


exports.getTenantsByRoom = async (req, res) => {

    const roomPpid = req.params.pprId; // Room PPID
    const propertyPpid = req.params.pppId;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    try {
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }
        const tenant = await Tenant.find({ $and: [{ "currentStay.propertyPpid": propertyPpid }, { "currentStay.roomPpid": roomPpid }] });
        if (!tenant || tenant.length === 0) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);

        await redisClient.set(cacheKey, JSON.stringify(tenant), { EX: 300 });

        res.status(200).json(tenant);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantProfile = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    if (role !== 'tenant') return res.status(403).json({ error: 'Forbidden, Access denied' });

    const pgpalId = currentUser.data.user.pgpalId;
    try {

        const Profile = await Tenant.findOne({ pgpalId: pgpalId });
        if (!Profile) return res.status(404).json({ error: 'Tenant not found' });

        const response = {
            name: Profile.name,
            phone: Profile.phone,
            currentStay: Profile.currentStay,
            status: Profile.status,
        };

        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.

    getTenantDocs = async (req, res) => {
        const internalService = req.headers['x-internal-service'];
        if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });
        const cacheKey = '/api' + req.originalUrl; // Always add /api
        const pppid = req.params.pppid;

        try {
            if (redisClient.isReady) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log('Returning cached username availability');
                    return res.status(200).send(JSON.parse(cached));
                }
            }
            const tenantsCount = await Tenant.countDocuments({ 'currentStay.propertyPpid': pppid, status: 'active' });

            const response = { activeTenants: tenantsCount };
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }

    };

exports.getCheckins = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    const cacheKey = '/api' + req.originalUrl; // Always add /api
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const pppid = req.params.pppid;
    const period = req.query.period || 'week'; // 'day', 'week', or 'month'
    let days;
    if (period === 'day') days = 1;
    else if (period === 'month') days = 30;
    else days = 7; // default to week

    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);


    try {
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }
        const checkins = await Tenant.find({
            'currentStay.propertyPpid': pppid,
            status: 'active',
            'currentStay.assignedAt': { $gte: fromDate }
        }).countDocuments();

        const response = { period, checkins };
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }

};


exports.getVacates = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const pppid = req.params.pppid;
    const period = req.query.period || 'week'; // 'day', 'week', or 'month'
    let days;
    if (period === 'day') days = 1;
    else if (period === 'month') days = 30;
    else days = 7; // default to week

    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);


    try {
        console.log(pppid, fromDate);
        const vacates = await Vacates.find({
            propertyId: pppid,
            vacateDate: { $gte: fromDate }
        }).countDocuments();
       
        const response = { period, vacates };
        const cacheKey = '/api' + req.originalUrl; // Always add /api
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }

}

