const { clearBed, assignBed, getOwnProperty } = require('./internalApis'); // Assuming you have a function to generate PPT IDs
const Vacates = require('../models/vacatesModel');
const Tenant = require('../models/tenantModel');


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
        console.log(pgpalId);
        const tenant = await Tenant.findOne({ pgpalId: { $regex: `^${pgpalId}$`, $options: 'i' } });
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
            assignedAt: currentStay.assignedAt,
            noticePeriodInMonths: currentStay.noticePeriodInMonths,
            isInNoticePeriod: currentStay.isInNoticePeriod
        };

        const updateProfile = {
            status: 'inactive',
            currentStay: {
                propertyPpid: null,
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
            tenantId: updatedTenant.pgpalId,
            propertyId: stayHistory.propertyId,
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
    const pgpalId = req.params.ppid;

    if (role !== 'owner') return res.status(403).json({ error: 'Only owners can retain tenants' });
    if (!id) return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    if (!pgpalId) return res.status(400).json({ error: 'Tenant PPID is required' });

    try {
        const tenant = await Tenant.findOne({ pgpalId: pgpalId });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const profile = tenant;
        if (profile.status === 'active') return res.status(400).json({ error: 'Tenant is already active' });
        const vacate = await Vacates.findOne({ tenantId: profile.pgpalId });
        if (!vacate) return res.status(404).json({ error: 'Vacate request not found' });
        if (!vacate.removedByOwner) return res.status(400).json({ error: 'This request raised by tenant, please ask tenant to withdraw request' });

        const property = await getOwnProperty(profile.stayHistory[0].propertyId, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });


        const previousSnapshot = vacate.previousSnapshot;
        const backupStay = {
            propertyPpid: previousSnapshot.propertyId,
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
            updatedAt: new Date()
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


        const assignBedResponse = await assignBed(previousSnapshot.roomId, previousSnapshot.bedId, profile.phone, previousSnapshot.rent, pgpalId, currentUser);
        if (!assignBedResponse) return res.status(400).json({ error: 'Failed to assign bed' });

        const updatedTenant = await Tenant.findByIdAndUpdate(tenant._id, updateProfile, { new: true });
        if (!updatedTenant) return res.status(404).json({ error: 'Tenant not found' });

        const updatedVacate = await Vacates.findByIdAndDelete(vacate._id, { new: true });
        if (!updatedVacate) return res.status(404).json({ error: 'Vacate request not found' });

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

        const property = await getOwnProperty(pgpalId, currentUser, ppid = true);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) return res.status(403).json({ error: 'You do not own this property' });

        const vacateHistory = await Vacates.find({ propertyId: pgpalId });
        if (!vacateHistory || vacateHistory.length === 0) return res.status(404).json({ error: 'Vacate history not found' });

        res.status(200).json({
            message: 'Vacate history fetched successfully',
            vacateHistory: vacateHistory
        });
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

    if (role !== 'owner') return res.status(403).json({ error: 'Only owners can get vacate history' });
    if (!id) return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    if (!propertyId) return res.status(400).json({ error: 'Property ID is required' });

    try {
        const vacateHistory = await Vacates.find({ propertyId: propertyId });
        if (!vacateHistory || vacateHistory.length === 0) return res.status(404).json({ error: 'Vacate history not found' });

        res.status(200).json({
            message: 'Vacate history fetched successfully',
            vacateHistory: vacateHistory
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};
