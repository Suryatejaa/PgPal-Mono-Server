const Tenant = require('../models/tenantModel');
const { generatePPT } = require('../utils/idGenerator'); // Assuming you have a function to generate PPT IDs
const { assignBed, getOwnProperty, getUserByPhone, getRoomByNumber, getUserByPpid } = require('./internalApis'); // Assuming you have a function to generate PPT IDs
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const sendMail = require('../utils/sendMail');

// Helper to fetch property & verify ownership

exports.addTenant = async (req, res) => {
    try {
        const currentUser = JSON.parse(req.headers['x-user']);
        const role = currentUser.data.user.role;
        const ownerId = currentUser.data.user._id;
        const ownerPpid = currentUser.data.user.pgpalId;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Only owners can add tenants' });
        }

        const { name, email, phone, gender, address, aadhar, propertyId, roomNumber, bedId, rentPaid, rentPaidDate, rentDueDate, rentPaidMethod, deposit, noticePeriodInMonths } = req.body;
        if (!name || !phone || !propertyId || !roomNumber || !bedId || !aadhar || deposit === undefined || noticePeriodInMonths === undefined || (rentPaid !== 0 && !rentPaidMethod)) {

            console.log('Missing required fields');
            return res.status(400).json({ error: 'Missing required fields, please check' });

        }
        const property = await getOwnProperty(propertyId, currentUser, ppid = false);
        console.log('property ', property.pgpalId);
        if (!property || property.ownerId !== ownerId) {
            console.log('You do not own this property');
            return res.status(403).json({ error: 'You do not own this property' });
        }
        const propertyPPP = property.pgpalId;
        const propertyName = property.name;

        const room = await getRoomByNumber(propertyId, roomNumber, currentUser);
        console.log('room ', room.pgpalId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const roomPPR = room.pgpalId;

        const existing = await Tenant.findOne({ $or: [{ phone }, { aadhar }] });

        console.log(existing?.aadhar, aadhar);

        if (existing?.status === 'active' && existing?.phone === phone.toString()) {
            console.log('Tenant with this phone already exists');
            return res.status(400).json({ error: 'Tenant with this phone already exists' });
        }
        if (existing?.status === 'active' && existing?.aadhar === aadhar.toString()) {
            console.log('Tenant with this aadhar already exists');
            return res.status(400).json({ error: 'Tenant with this aadhar already exists' });
        }

        const bed = room.beds.find(b => b.bedId === bedId);

        if (!bed || bed.status === 'occupied') {
            console.log('Bed not available');
            return res.status(400).json({ error: 'Bed not available' });
        }

        let tenantPpt;
        // Create tenant
        const existingUser = await getUserByPhone(phone, currentUser);
        if (!existingUser) {
            let newppt = generatePPT();
            let existingPpt = await getUserByPpid(newppt, currentUser);
            while (existingPpt) {
                newppt = generatePPT();
                existingPpt = await getUserByPpid(newppt, currentUser);
            }
            tenantPpt = newppt;
        } else {
            tenantPpt = existingUser.pgpalId;
        }

        const rent = room.rentPerBed;

        const assigned = await assignBed(roomPPR, bedId, phone, rent, tenantPpt, currentUser);
        if (assigned?.status !== 200) {
            console.log('Failed to assign bed');
            return res.status(400).json({ error: 'Failed to assign bed' });
        }
        const newDue = Math.max(rent - rentPaid, 0);
        const advance = newDue < 0 ? Math.abs(newDue) : 0;
        const rentDue = newDue > 0 ? newDue : 0;
        const status = rentDue > 0 ? 'unpaid' : 'paid';

        const tenantData = {
            name,
            phone,
            gender,
            address,
            pgpalId: tenantPpt,
            aadhar,
            status: 'active',
            currentStay: {
                propertyPpid: propertyPPP,
                propertyName: propertyName,
                roomPpid: roomPPR,
                rent: room.rentPerBed,
                rentPaid: rentPaid,
                rentDue: rentDue,
                rentPaidDate: rentPaidDate ? rentPaidDate : rentPaid > 0 ? new Date() : null,
                rentDueDate: rentDueDate ? rentDueDate : room.rentPerBed - rentPaid > 0 ? new Date(new Date().setDate(new Date().getDate() + 7)) : new Date(new Date().setMonth(new Date().getMonth() + 1)),
                rentPaidStatus: status,
                rentPaidMethod: rentPaidMethod,
                rentPaidTransactionId: null,
                nextRentDueDate: new Date(new Date().setMonth(new Date().getMonth() + 1)), // Assuming rent is due monthly                
                deposit: deposit,
                advanceBalance: advance,
                noticePeriodInMonths: noticePeriodInMonths,
                isInNoticePeriod: false,
                bedId
            },
            createdBy: ownerId
        };

        if (email) {
            tenantData.email = email;
        }

        const tenant = existing ? await Tenant.findByIdAndUpdate(existing._id, tenantData, { new: true }) : await Tenant.create(tenantData);

        const propertyPpid = property.pgpalId;

        const title = "New Tenant Added";
        const message = "A new tenant has been added to the system.";
        const type = "info";
        const method = ["in-app", "email"];

        try {
            console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantIds: [tenantPpt],
                propertyPpid: propertyPpid,
                title,
                message,
                type: type,
                method,
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }


        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);
        await invalidateCacheByPattern(`*${propertyId}*`);


        console.log('Tenant added and assigned successfully');
        res.status(201).json({
            message: 'Tenant added and assigned successfully',
            tenant
        });

    } catch (err) {
        console.error('[addTenant] Error:', err);
        res.status(500).json({ error: err.message });
    }
};


// ✅ Update tenant
exports.updateTenant = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    const ownerPpid = currentUser.data.user.pgpalId;

    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    const _id = req.query.id;
    try {
        const updates = req.body;


        const Tenant = await Tenant.findOne({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!Tenant) return res.status(404).json({ error: 'Tenant not found' });

        const property = await getOwnProperty(Tenant.currentStay.propertyPpid, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this tenant' });

        const updatedTenant = await Tenant.findByIdAndUpdate({ $or: [{ phone }, { pgpalId }, { _id }] }, updates, {
            new: true,
            runValidators: true
        });

        const propertyPpid = property.pgpalId;

        const title = "Tenant Details Updated";
        const message = "Tenant profile or stay information has been updated.";
        const type = "info";
        const method = ["in-app"];

        try {
            console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantIds: [Tenant.pgpalId],
                propertyPpid: propertyPpid,
                title,
                message,
                type: type,
                method,
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);

        res.status(200).json({ message: 'Tenant updated successfully', updatedTenant });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// ✅ Delete tenant
exports.deleteTenant = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;

    try {

        const Tenant = await Tenant.findOne({ $or: [{ phone }, { pgpalId }] });
        if (!Tenant) return res.status(404).json({ error: 'Tenant not found' });

        const property = await getOwnProperty(Tenant.currentStay.propertyPpid, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this tenant' });

        await Tenant.findOneAndDelete({ $or: [{ phone }, { pgpalId }] });

        const propertyPpid = property.pgpalId;

        const title = "Tenant Removed";
        const message = "A tenant has been removed from the system.";
        const type = "alert";
        const method = ["in-app", "email"];

        try {
            console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantIds: [Tenant.pgpalId],
                propertyPpid: propertyPpid,
                title,
                message,
                type: type,
                method,
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }


        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);

        res.status(200).json({ message: 'Tenant deleted successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.notifyTenant = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    const _id = req.query.id;

    try {
        const tenant = await Tenant.findOne({ $or: [{ phone }, { pgpalId }, { _id }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

        // Check if tenant has unpaid rent
        const rentDue = tenant.currentStay?.rentDue;
        if (!rentDue || rentDue <= 0) {
            return res.status(200).json({ message: `Tenant ${tenant.pgpalId} has no pending rent.` });
        }

        // Send email (replace with your actual mailer logic)
        if (tenant.email) {
            await sendMail({
                to: tenant.email,
                subject: 'Rent Due Reminder',
                text: `Dear ${tenant.name}, your rent of ₹${rentDue} in ${tenant.currentStay.propertyName} is due. Please pay as soon as possible.`
            });
        }

        // Send notification
        const title = "Rent Due Reminder";
        const message = `Dear ${tenant.name}, your rent of ₹${rentDue} in ${tenant.currentStay.propertyName} is due. Please pay as soon as possible.`;
        const type = "alert";
        const method = ["in-app", "email"];

        await notificationQueue.add('notifications', {
            tenantIds: [tenant.pgpalId],
            propertyPpid: tenant.currentStay.propertyPpid,
            title,
            message,
            type,
            method,
            createdBy: 'system'
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 3000
            }
        });

        res.status(200).json({ message: `notified ${tenant.pgpalId} successfully` });
    } catch (err) {
        console.error('[notifyTenant] Error:', err);
        res.status(500).json({ error: err.message });
    }
};