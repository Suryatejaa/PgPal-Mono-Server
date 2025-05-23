const { clearBed, assignBed, getOwnProperty } = require('./internalApis'); // Assuming you have a function to generate PPT IDs
const Vacates = require('../models/vacatesModel');
const Tenant = require('../models/tenantModel');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');

exports.removeTenant = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;

    const pgpalId = req.params.ppid;
    const reason = req.body.reason;
    const isImmediateVacate = req.body.isImmediateVacate;
    const isDepositRefunded = req.body.isDepositRefunded;
    const isVacatedAlready = req.body.isVacatedAlreay;

    if (role !== 'owner') return res.status(403).json({ error: 'Only owners can remove tenants' });
    if (!id) return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    if (!pgpalId) return res.status(400).json({ error: 'Tenant PPID is required' });

    try {
        //console.log(pgpalId);
        const tenant = await Tenant.findOne({ pgpalId: { $regex: `^${pgpalId}$`, $options: 'i' } });
        //console.log("Remove tenant: ", pgpalId, tenant);
        const profile = tenant;

        if (!profile) return res.status(404).json({ error: 'Tenant not found' });
        if (profile.status === 'inactive') return res.status(400).json({ error: 'Tenant is already inactive' });
        if (profile.currentStay.isInNoticePeriod) return res.status(400).json({ error: 'Tenant is already in notice period' });

        const property = await getOwnProperty(profile.currentStay.propertyPpid, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });


        const currentStay = profile.currentStay;
        const deposit = currentStay.deposit;

        let endMessage;
        if (isImmediateVacate && deposit && !isDepositRefunded) {
            endMessage = `Since its an immediate vacate, tenant do not get INR:${deposit} deposit back`;
        } else if (isImmediateVacate && isDepositRefunded) {
            endMessage = `Deposit INR:${deposit} is settled to tenant`;
        } else if (!isImmediateVacate && deposit && !isDepositRefunded) {
            endMessage = `Tenant has to vacate after notice period and deposit INR:${deposit} needs to be settled`;
        } else if (!isImmediateVacate && isDepositRefunded) {
            endMessage = `Deposit INR:${deposit} is settled to tenant`;
        }

        const isInNoticePeriod = isImmediateVacate || isVacatedAlready ? false : true;
        const noticePeriodStartDate = isInNoticePeriod ? new Date() : null;
        const noticePeriodEndDate = isInNoticePeriod ? new Date(Date.now() + currentStay.noticePeriodInMonths * 30 * 24 * 60 * 60 * 1000) : null;
        const vacateDate = isImmediateVacate ? new Date() : new Date(Date.now() + currentStay.noticePeriodInMonths * 30 * 24 * 60 * 60 * 1000);

        const stayHistory = {
            propertyId: currentStay.propertyPpid,
            roomId: currentStay.roomPpid,
            bedId: currentStay.bedId,
            from: currentStay.assignedAt,
            to: vacateDate
        };
        const currentStaySnapShot = {
            propertyId: currentStay.propertyPpid,
            propertyName: property.name,
            roomId: currentStay.roomPpid,
            bedId: currentStay.bedId,
            rent: currentStay.rent,
            rentPaid: currentStay.rentPaid,
            rentDue: currentStay.rentDue,
            rentPaidDate: currentStay.rentPaidDate,
            rentDueDate: currentStay.rentDueDate,
            rentPaidStatus: currentStay.rentPaidStatus,
            rentPaidMethod: currentStay.rentPaidMethod,
            rentPaidTransactionId: currentStay.rentPaidTransactionId,
            nextRentDueDate: currentStay.nextRentDueDate,
            deposit: currentStay.deposit,
            advanceBalance: currentStay.advance,
            assignedAt: currentStay.assignedAt,
            noticePeriodInMonths: currentStay.noticePeriodInMonths,
            isInNoticePeriod: currentStay.isInNoticePeriod,
            location: currentStay.location,
        };

        const updateProfile = {
            status: 'inactive',
            currentStay: {
                propertyPpid: null,
                propertyName: null,
                roomPpid: null,
                bedId: null,
                rent: null,
                deposit: null,
                assignedAt: null,
                noticePeriodInMonths: 0,
                isInNoticePeriod: false
            },
            stayHistory: [...profile.stayHistory, stayHistory],
            isInNoticePeriod: isInNoticePeriod,
            noticePeriodStartDate: noticePeriodStartDate,
            noticePeriodEndDate: vacateDate,
            updatedAt: new Date()
        };

        const clearBedResponse = await clearBed(currentStay.roomPpid, currentStay.bedId, currentUser);
        if (!clearBedResponse) return res.status(400).json({ error: 'Failed to clear bed' });

        const updatedTenant = await Tenant.findByIdAndUpdate(profile._id, updateProfile, { new: true });
        if (!updatedTenant) return res.status(404).json({ error: 'Tenant not found' });

        const vacate = {
            name: updatedTenant.name,
            tenantId: updatedTenant.pgpalId,
            propertyId: stayHistory.propertyId,
            propertyName: stayHistory.propertyName,
            roomId: stayHistory.roomId,
            bedId: stayHistory.bedId,
            isImmediateVacate: isImmediateVacate,
            isDepositRefunded: isDepositRefunded,
            vacateDate: vacateDate,
            noticePeriodStartDate: noticePeriodStartDate,
            noticePeriodEndDate: noticePeriodEndDate,
            reason: reason,
            status: isImmediateVacate ? 'completed' : 'noticeperiod',
            createdBy: id,
            removedByOwner: true,
            previousSnapshot: currentStaySnapShot
        };

        const vacateRequest = await Vacates.create(vacate);
        if (!vacateRequest) return res.status(404).json({ error: 'Vacate request not created' });

        const propertyPpid = property.pgpalId;
        const title = "Tenant Removed by Owner";
        const message = "A tenant has been forcefully removed by the owner.";
        const type = "alert";
        const method = ["in-app", "email", "sms"];

        try {
            //console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantId: pgpalId,
                propertyPpid: propertyPpid,
                audience: 'tenant',
                title,
                message,
                type,
                method,
                meta: { vacateId: vacateRequest._id },
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


        res.status(201).json({
            message: 'Tenant removed successfully',
            Comments: {
                message: 'Vacate request created successfully',
                Notes: endMessage,
            },
            vacateRequest: vacateRequest
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.retainTenant = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    const vacateId = req.params.vacateId;

    if (role !== 'owner') return res.status(403).json({ error: 'Only owners can retain tenants' });
    if (!id) return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    if (!vacateId) return res.status(400).json({ error: 'Vacate ID is required' });



    try {
        // const tenant = await Tenant.findOne({ pgpalId: { $regex: `^${pgpalId}$`, $options: 'i' } });
        const vacate = await Vacates.findById(vacateId);
        if (!vacate) return res.status(404).json({ error: 'Vacate request not found' });
        const pgpalId = vacate.tenantId;
        const tenant = await Tenant.findOne({ pgpalId: vacate.tenantId });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const profile = tenant;
        if (profile.status === 'active') return res.status(400).json({ error: 'Tenant is already active' });

        if (!vacate.removedByOwner) return res.status(400).json({ error: 'This request raised by tenant, please ask tenant to withdraw request' });

        const property = await getOwnProperty(profile.stayHistory[0].propertyId, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });


        const previousSnapshot = vacate.previousSnapshot;
        const backupStay = {

            propertyPpid: previousSnapshot.propertyId,
            propertyName: previousSnapshot.propertyName,
            roomPpid: previousSnapshot.roomId,
            bedId: previousSnapshot.bedId,
            rent: previousSnapshot.rent,
            rentPaid: previousSnapshot.rentPaid,
            rentDue: previousSnapshot.rentDue,
            rentPaidDate: previousSnapshot.rentPaidDate,
            rentDueDate: previousSnapshot.rentDueDate,
            rentPaidStatus: previousSnapshot.rentPaidStatus,
            rentPaidMethod: previousSnapshot.rentPaidMethod,
            rentPaidTransactionId: previousSnapshot.rentPaidTransactionId,
            nextRentDueDate: previousSnapshot.nextRentDueDate,
            deposit: previousSnapshot.deposit,
            assignedAt: previousSnapshot.assignedAt,
            noticePeriodInMonths: previousSnapshot.noticePeriodInMonths,
            isInNoticePeriod: false,
            updatedAt: new Date(),
            location: previousSnapshot.location
        };
        const updateProfile = {
            status: 'active',
            currentStay: backupStay,
            isInNoticePeriod: false,
            noticePeriodStartDate: null,
            noticePeriodEndDate: null,
            updatedAt: new Date()
        };

        if (profile.stayHistory.length > 0) {
            const last = profile.stayHistory[profile.stayHistory.length - 1];
            if (last.to && new Date(last.to).getTime() === new Date(vacate.vacateDate).getTime()) {
                profile.stayHistory.pop();
            }
        }

        updateProfile.stayHistory = [...profile.stayHistory];


        const assignBedResponse = await assignBed(previousSnapshot.roomId, previousSnapshot.bedId, profile.phone, previousSnapshot.rent, vacate.tenantId, currentUser);
        if (!assignBedResponse) return res.status(400).json({ error: 'Failed to assign bed' });

        const updatedTenant = await Tenant.findByIdAndUpdate(tenant._id, updateProfile, { new: true });
        if (!updatedTenant) return res.status(404).json({ error: 'Tenant not found' });

        const updatedVacate = await Vacates.findByIdAndDelete(vacate._id, { new: true });
        if (!updatedVacate) return res.status(404).json({ error: 'Vacate request not found' });

        const propertyPpid = property.pgpalId;

        const title = "Tenant Retained";
        const message = "The vacate request has been cancelled by the owner. The tenant will continue to stay.";
        const type = "info";
        const method = ["in-app", "email"];

        try {
            //console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantId: pgpalId,
                propertyPpid: propertyPpid,
                audience: 'tenant',
                title,
                message,
                type,
                method,
                meta: { vacateId: vacateId },
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
        await invalidateCacheByPattern(`*${property._id}*`);


        res.status(200).json({
            message: 'Tenant retained successfully',
            vacateRequest: updatedVacate
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getVacateHistory = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    const pgpalId = req.params.pppid;

    if (role !== 'owner') return res.status(403).json({ error: 'Only owners can get vacate history' });
    if (!id) return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    if (!pgpalId) return res.status(400).json({ error: 'Tenant PPID is required' });

    try {
        const cacheKey = '/api' + req.originalUrl; // Always add /api

        const property = await getOwnProperty(pgpalId, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });

        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }

        const vacateHistory = await Vacates.find({ propertyId: pgpalId });
        if (!vacateHistory || vacateHistory.length === 0) return res.status(404).json({ error: 'Vacate history not found' });

        await redisClient.set(cacheKey, JSON.stringify(vacateHistory), { EX: 300 });

        res.status(200).json(vacateHistory);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getVacateHistotyByProperty = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const id = currentUser.data.user._id;
    const propertyId = req.params.pppid;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    if (role !== 'owner') return res.status(403).json({ error: 'Only owners can get vacate history' });
    if (!id) return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    if (!propertyId) return res.status(400).json({ error: 'Property ID is required' });

    try {

        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }

        const vacateHistory = await Vacates.find({ propertyId: propertyId });
        if (!vacateHistory || vacateHistory.length === 0) return res.status(404).json({ error: 'Vacate history not found' });

        await redisClient.set(cacheKey, JSON.stringify(vacateHistory), { EX: 300 });

        res.status(200).json(vacateHistory);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};
