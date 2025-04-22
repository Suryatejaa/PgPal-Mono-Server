
const Tenant = require('../models/tenantModel');
const { getOwnProperty } = require('./internalApis'); // Assuming you have a function to generate PPT IDs

// ✅ Get all tenants (owned or added by this PG owner)
exports.getTenants = async (req, res) => {
    try {
        const currentUser = JSON.parse(req.headers['x-user']);
        const role = currentUser.data.user.role;
        const ownerid = currentUser.data.user._id;
        console.log(ownerid, role);

        const myPG = await getOwnProperty(ownerid, currentUser);
        let tenants;
        if (role === 'owner') {
            tenants = await Tenant.find({ createdBy: currentUser.data.user._id });
        } else {
            tenants = await Tenant.find(); // For admin role or future use
        }

        res.status(200).json(tenants);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ✅ Get tenant by ID
exports.getTenantByQuery = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    const _id = req.query.id;
    const status = req.query.status;
    try {
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }, { status }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);
        console.log(ppId[0]);
        res.status(200).json(tenant);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantByPhNum = async (req, res) => {
    console.log('getTenantByPhNum called');
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const phone = req.params.phnum;

    try {
        const tenant = await Tenant.find({ phone });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);
        console.log(ppId[0]);
        res.status(200).json(ppId[0]);
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantStayStatus = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    const _id = req.query.id;
    console.log('Queries ', phone, pgpalId, _id, status);

    try {
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        console.log(tenant[0].currentStay);
        res.status(200).json({ currentStay: tenant[0].currentStay });
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
        res.status(200).json(tenant[0].stayHistory);
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
        console.log(ppId[0]);
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
        res.status(200).json({
            name: Profile.name,
            phone: Profile.phone,
            currentStay: Profile.currentStay,
            status: Profile.status,
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
}

