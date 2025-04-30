const Payment = require('../models/paymentModel');
const { getTenantConfirmation } = require("./internalApis");

// 1. Update rent details for a tenant
exports.updateRent = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const { propertyPpid } = req.params;
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;


    const { tenantId, rentPaid, rentPaidDate, rentPaidMethod, transactionId } = req.body;
    if (!tenantId || rentPaid == null || !rentPaidMethod) {
        return res.status(400).json({ error: 'Missing required rent fields' });
    }

    const profile = await getTenantConfirmation(tenantId, currentUser);
    console.log([profile]);

    const property = await getOwnProperty(profile.currentStay.propertyPpid, currentUser, ppid = true);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });

    try {
        const tenant = await Tenant.findOne({ pgpalId: tenantId });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const rent = tenant.currentStay.rent;
        const newDue = rent - rentPaid;

        tenant.currentStay.rentPaid = rentPaid;
        tenant.currentStay.rentDue = newDue > 0 ? newDue : 0;
        tenant.currentStay.rentPaidDate = rentPaidDate ? new Date(rentPaidDate) : new Date();
        tenant.currentStay.rentPaidStatus = newDue > 0 ? 'unpaid' : 'paid';
        tenant.currentStay.rentPaidMethod = rentPaidMethod;
        tenant.currentStay.rentPaidTransactionId = transactionId || null;
        tenant.currentStay.nextRentDueDate = new Date(new Date().setMonth(new Date().getMonth() + 1));
        tenant.updatedAt = new Date();

        const updated = await tenant.save();
        res.status(200).json({ message: 'Rent updated successfully', tenant: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Get rent status for a tenant
exports.getRentStatus = async (req, res) => {
    const { tenantId } = req.params;
    try {
        const tenant = await Tenant.findOne({ pgpalId: tenantId });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const { rent, rentPaid, rentDue, rentPaidDate, rentPaidStatus, nextRentDueDate } = tenant.currentStay;

        res.status(200).json({
            rent,
            rentPaid,
            rentDue,
            rentPaidDate,
            status: rentPaidStatus,
            nextRentDueDate
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Get rent summary for property
exports.getRentSummary = async (req, res) => {
    const { propertyPpid } = req.params;
    try {
        const tenants = await Tenant.find({ 'currentStay.propertyPpid': propertyPpid, status: 'active' });

        const summary = tenants.map(t => ({
            tenantId: t.pgpalId,
            name: t.name,
            phone: t.phone,
            rent: t.currentStay.rent,
            rentPaid: t.currentStay.rentPaid,
            rentDue: t.currentStay.rentDue,
            status: t.currentStay.rentPaidStatus,
            nextRentDueDate: t.currentStay.nextRentDueDate
        }));

        res.status(200).json({ propertyPpid, tenants: summary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Get rent defaulters for property
exports.getRentDefaulters = async (req, res) => {
    const { propertyPpid } = req.params;
    try {
        const defaulters = await Tenant.find({
            'currentStay.propertyPpid': propertyPpid,
            'currentStay.rentPaidStatus': 'unpaid',
            status: 'active'
        });

        const formatted = defaulters.map(t => ({
            tenantId: t.pgpalId,
            name: t.name,
            phone: t.phone,
            rentDue: t.currentStay.rentDue,
            rentPaidDate: t.currentStay.rentPaidDate
        }));

        res.status(200).json({ totalDefaulters: formatted.length, defaulters: formatted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
