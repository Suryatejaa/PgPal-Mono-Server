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

        const cacheKey = req.originalUrl;
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

    try {
        const tenant = await Tenant.findOne(query);

        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        console.log(tenant.pgpalId);

        const refreshedCurrentStay = refreshRentForBilling(tenant.currentStay);

        const response = {
            name: tenant.name,
            pgpalId: tenant.pgpalId,
            phone: tenant.phone,
            aadhar: tenant.aadhar,
            status: tenant.status,
            In_Notice_Period: tenant.isInNoticePeriod,
            currentStay: refreshedCurrentStay,
            addedBy: tenant.createdBy,
            stayHistory: tenant.stayHistory ? tenant.stayHistory : null
        };

        const cacheKey = req.originalUrl;
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantByPhNum = async (req, res) => {
    
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const phone = req.params.phnum;

    console.log(phone)
    try {
        const tenant = await Tenant.find({ phone });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);

        const cacheKey = req.originalUrl;
        await redisClient.set(cacheKey, JSON.stringify(ppId[0]), { EX: 300 });

        console.log('tenant: ',tenant)
        console.log('ppid: ',ppId)
        res.status(200).json(ppId[0]);
    } catch (err) {
        console.log(err.message)
        res.status(400).json({ message: err.message });
    }
};

exports.getTenantStayStatus = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid; //tenantID
    const _id = req.query.id;

    try {
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const response = { currentStay: tenant[0].currentStay };
        const cacheKey = req.originalUrl;
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
    if (role !== 'tenant') return res.status(403).json({ error: 'Forbidden, Access denied' });

    try {
        const tenant = await Tenant.find({ $or: [{ phone: currentUser.data.user.phone }, { pgpalId }, { _id }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const response = { currentStay: tenant[0].currentStay };

        const cacheKey = req.originalUrl;
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

    try {
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const response = tenant[0].stayHistory;
        const cacheKey = req.originalUrl;
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

    try {
        const tenant = await Tenant.find({ $and: [{ "currentStay.propertyPpid": propertyPpid }, { "currentStay.roomPpid": roomPpid }] });
        if (!tenant || tenant.length === 0) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);

        const cacheKey = req.originalUrl;
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

        const cacheKey = req.originalUrl;
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantDocs = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const pppid = req.params.pppid;
    try {
        const tenantsCount = await Tenant.countDocuments({ 'currentStay.propertyPpid': pppid, status: 'active' });
        if (tenantsCount === 0) return res.status(404).json({ error: 'Tenant not found' });

        const response = { activeTenants: tenantsCount };
        const cacheKey = req.originalUrl;
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }

};

exports.getCheckins = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const pppid = req.params.pppid;
    const period = req.query.period || 'week'; // 'week' or 'month'
    const days = period === 'month' ? 30 : 7;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);


    try {
        const checkins = await Tenant.find({
            'currentStay.propertyPpid': pppid,
            status: 'active',
            'currentStay.assignedAt': { $gte: fromDate }
        }).countDocuments();

        const response = { period, checkins };
        const cacheKey = req.originalUrl;
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
    const period = req.query.period || 'week'; // 'week' or 'month'
    const days = period === 'month' ? 30 : 7;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);


    try {
        const vacates = await Vacates.find({
            propertyId: pppid,
            vacateDate: { $gte: fromDate }
        }).countDocuments();

        const response = { period, vacates };
        const cacheKey = req.originalUrl;
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }

}

