const Tenant = require('../models/tenantModel');
const Vacate = require('../models/vacatesModel');
const { getOwnProperty, getUserByPhone } = require("./internalApis");
const notificationQueue = require('../utils/notificationQueue.js');
const CacheHelper = require('../utils/CacheHelper');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const { sendMail, generateRentBillPDF } = require('../utils/sendMail');
const fs = require('fs');


// 1. Update rent details for a tenant
exports.updateRent = async (req, res) => {
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
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;


    const { tenantId, rentPaid, rentPaidDate, rentPaidMethod, transactionId } = req.body;
    if (!tenantId || rentPaid == null || !rentPaidMethod) {
        return res.status(400).json({ error: 'Missing required rent fields' });
    }

    if (!['upi', 'cash', 'bank'].includes(rentPaidMethod)) {
        return res.status(400).json({ error: 'Invalid Payment Method' });
    }

    try {
        const tenant = await Tenant.findOne({ pgpalId: tenantId });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const isInNoticePeriod = tenant.isInNoticePeriod;

        const property = await getOwnProperty(tenant.currentStay.propertyPpid, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });

        const propertyPpid = property.pgpalId;

        const rent = tenant.currentStay.rent;
        const lastPaid = tenant.currentStay.rentPaid ? tenant.currentStay.rentPaid : 0;
        const totalPaid = rentPaid + lastPaid;
        const newDue = rent - totalPaid;
        const advance = newDue < 0 ? Math.abs(newDue) : 0;
        const rentDue = newDue > 0 ? newDue : 0;
        const status = rentDue > 0 ? 'unpaid' : 'paid';

        const assignedDate = new Date(tenant.currentStay.assignedAt); // Get assigned date
        const currentDate = new Date(); // Current date
        const nextMonth = new Date(currentDate.setMonth(currentDate.getMonth() + 1)); // Add one month to current date
        const nextRentDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), assignedDate.getDate()); // Use day from assignedDate

        const updatedTenant = await Tenant.findOneAndUpdate(
            { pgpalId: tenantId },
            {
                $set: {
                    'currentStay.rentPaid': totalPaid,
                    'currentStay.rentDue': rentDue,
                    'currentStay.rentPaidDate': rentPaidDate ? new Date(rentPaidDate) : new Date(),
                    'currentStay.rentDueDate': newDue > 0 ? new Date(new Date().setDate(new Date().getDate() + 7)) : nextRentDueDate,
                    'currentStay.advanceBalance': advance,
                    'currentStay.rentPaidStatus': status,
                    'currentStay.rentPaidMethod': rentPaidMethod,
                    'currentStay.rentPaidTransactionId': transactionId || null,
                    'currentStay.nextRentDueDate': nextRentDueDate,
                    updatedAt: new Date()
                }
            },
            { new: true } // Return the updated document
        );

        if (!updatedTenant) return res.status(404).json({ error: 'Failed to update tenant rent details' });

        if (isInNoticePeriod) {
            const vacate = await Vacate.findOne({ tenantId, status: 'noticeperiod' });
            if (vacate) {
                const rent = vacate.previousSnapshot.rent;
                const lastPaid = vacate.previousSnapshot.rentPaid ? vacate.previousSnapshot.rentPaid : 0;
                const totalPaid = rentPaid + lastPaid;
                const newDue = rent - totalPaid;
                const advance = newDue < 0 ? Math.abs(newDue) : 0;
                const rentDue = newDue > 0 ? newDue : 0;
                const status = rentDue > 0 ? 'unpaid' : 'paid';

                const assignedDate = new Date(vacate.previousSnapshot.assignedAt); // Get assigned date
                const currentDate = new Date(); // Current date
                const nextMonth = new Date(currentDate.setMonth(currentDate.getMonth() + 1)); // Add one month to current date
                const nextRentDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), assignedDate.getDate()); // Use day from assignedDate
                
                const updatedVacate = await Vacate.findOneAndUpdate(
                    { tenantId, status: 'noticeperiod' },
                    {
                        $set: {
                            'previousSnapshot.rentPaid': totalPaid,
                            'previousSnapshot.rentDue': rentDue,    
                            'previousSnapshot.rentPaidDate': rentPaidDate ? new Date(rentPaidDate) : new Date(),
                            'previousSnapshot.rentDueDate': newDue > 0 ? new Date(new Date().setDate(new Date().getDate() + 7)) : nextRentDueDate,
                            'previousSnapshot.advanceBalance': advance,
                            'previousSnapshot.rentPaidStatus': status,
                            'previousSnapshot.rentPaidMethod': rentPaidMethod,
                            'previousSnapshot.rentPaidTransactionId': transactionId || null,
                            'previousSnapshot.nextRentDueDate': nextRentDueDate,
                            updatedAt: new Date()
                        }
                    },
                    { new: true }// Return the updated document
                );
                if (!updatedVacate) return res.status(404).json({ error: 'Failed to update vacate rent details' });
            }
        }


        const title = "Rent Information Updated";
        const message = `The rent of ₹.${rentPaid} for your stay at ${property.name} of bed ${tenant.currentStay.bedId} has been updated.`;
        const type = "info";
        const method = ["in-app"];

        try {
            //console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantId: tenantId,
                propertyPpid: propertyPpid,
                audience: 'tenant',
                title,
                message,
                type,
                method,
                meta: { rentPaidDate: updatedTenant.currentStay.rentPaidDate, rentPaid: updatedTenant.currentStay.rentPaid },
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });
            //console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);
        await invalidateCacheByPattern(`*${tenantId}*`);
        await invalidateCacheByPattern(`*/tenants?ppid*`);
        await invalidateCacheByPattern(`*/tenants?*`);

        const getUser = await getUserByPhone(tenant.phone, currentUser);
        console.log(getUser);
        const userEmail = getUser.email ? getUser.email : null;
        if (userEmail) {
            const pdfPath = await generateRentBillPDF(tenant, property, rentPaid, rentPaidDate);
            await sendMail({
                to: userEmail,
                subject: `Bill for rent payment for your stay in ${property.name}`,
                text: `Dear ${tenant.name},
                \n\nYour rent payment of ₹${rentPaid} has been successfully recorded for your stay at ${property.name}.
                \n\nDetails:
                \n- Property: ${property.name}
                \n- Bed ID: ${tenant.currentStay.bedId}
                \n- Rent Paid: ₹${rentPaid}
                \n- Paid Date: ${rentPaidDate ? new Date(rentPaidDate).toLocaleDateString() : new Date().toLocaleDateString()}
                \n- Status: ${updatedTenant.currentStay.rentPaidStatus}
                \n\nThank you for your timely payment.
                \n\nBest regards,
                \nPurple PG Team
                \n\nPlease find attached your rent bill.'`,
                attachments: [
                    {
                        filename: `Rent-bill-${tenant.pgpalId}.pdf`,
                        path: pdfPath
                    }
                ]
            });
            // Optionally delete the file after sending
            fs.unlink(pdfPath, () => { });
        }

        res.status(200).json({ message: 'Rent updated successfully', tenant: updatedTenant });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Get rent status for a tenant
exports.getRentStatus = async (req, res) => {
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
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    const { tenantId } = req.params;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    try {
        const tenant = await Tenant.findOne({ pgpalId: tenantId });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        const propertyPpid = tenant.currentStay.propertyPpid;

        const property = await getOwnProperty(propertyPpid, currentUser, ppid = true);
        //console.log(property.pgpalId);
        //console.log(property.ownerId.toString() !== id);
        //console.log(property.ownerId.toString());
        //console.log(id);
        if (property.status && property.status !== 200) return res.status(404).json({ error: property.error });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });

        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).json(cached);
            }
        }

        const { rent, rentPaid, rentDue, rentPaidDate, rentPaidStatus, nextRentDueDate } = tenant.currentStay;

        const response = {
            rent,
            rentPaid,
            rentDue,
            rentPaidDate,
            status: rentPaidStatus,
            nextRentDueDate
        };

        await CacheHelper.set(cacheKey, response, 600);

        res.status(200).json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Get rent summary for property
exports.getRentSummary = async (req, res) => {
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
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;

    const { propertyPpid } = req.params;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    try {

        const property = await getOwnProperty(propertyPpid, currentUser, ppid = true);
        if (property.status && property.status !== 200) return res.status(404).json({ error: property.error });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });


        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).json(cached);
            }
        }

        const tenants = await Tenant.find({ 'currentStay.propertyPpid': propertyPpid, status: 'active' });

        const summary = tenants.map(t => ({
            tenantId: t.pgpalId,
            name: t.name,
            phone: t.phone,
            status: t.status,
            rent: t.currentStay.rent,
            rentPaid: t.currentStay.rentPaid,
            rentDue: t.currentStay.rentDue,
            rentStatus: t.currentStay.rentPaidStatus,
            nextRentDueDate: t.currentStay.nextRentDueDate
        }));

        const response = { propertyPpid, tenants: summary };

        await CacheHelper.set(cacheKey, response, 600);

        res.status(200).json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Get rent defaulters for property
exports.getRentDefaulters = async (req, res) => {
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
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    const { propertyPpid } = req.params;
    try {
        const property = await getOwnProperty(propertyPpid, currentUser, ppid = true);
        //console.log(property.status);
        if (property.status && property.status !== 200) return res.status(404).json({ error: property.error });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });

        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).json(cached);
            }
        }

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
            status: t.currentStay.rentPaidStatus,
            rentPaidDate: t.currentStay.rentPaidDate
        }));

        const response = { totalDefaulters: formatted.length, defaulters: formatted };

        await CacheHelper.set(cacheKey, response, 600);

        res.status(200).json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
