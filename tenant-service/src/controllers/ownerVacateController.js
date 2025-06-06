//ownerVacateController.js

const { clearBed, assignBed, getOwnProperty, changeBedStatus } = require('./internalApis');
const Vacates = require('../models/vacatesModel');
const Tenant = require('../models/tenantModel');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const {
    getTenantProfile,
    validateTenantRemovalEligibility,
    validatePropertyOwnership,
    calculateVacateDate,
    createStayHistoryEntry,
    createCurrentStaySnapshot
} = require('./vacateUtilFunctions.js');

const {
    notifyVacateApproved,
    notifyVacateRejected,
    notifyVacateRemoved,
    notifyVacateWithdrawnOrRetained,
    notifyBulkVacateRemoved
} = require('../utils/vacateNotifications');


exports.removeTenant = async (req, res) => {
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
    if (role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can remove tenants' });
    }

    const { pgpalId, phone, _id, username } = currentUser.data.user;
    const { ppid } = req.params;
    const { reason, isImmediateVacate, isDepositRefunded, isVacatedAlready } = req.body;

    // Input validation
    if (!ppid) {
        return res.status(400).json({ error: 'Tenant PPID is required' });
    }

    if (!reason || typeof isImmediateVacate !== 'boolean') {
        return res.status(400).json({
            error: 'Both reason and isImmediateVacate are required and isImmediateVacate must be boolean.'
        });
    }


    try {
        // Get tenant profile
        const tenant = await getTenantProfile(ppid);

        const existingImmediateVacate = await Vacates.findOne({
            tenantId: tenant.pgpalId,
            status: 'pending_owner_approval',
            propertyId: tenant.currentStay.propertyPpid,
        });
        if (existingImmediateVacate) {
            return res.status(400).json({
                error: 'Tenant has already raised an immediate vacate request. Please approve or reject that request instead of removing the tenant.'
            });
        }

        // Validate eligibility
        validateTenantRemovalEligibility(tenant);

        // Validate property ownership
        const property = await validatePropertyOwnership(
            tenant.currentStay.propertyPpid,
            currentUser.data.user._id,
            currentUser
        );

        const currentStay = tenant.currentStay;
        const deposit = currentStay.deposit || 0;

        // Calculate vacate date
        const vacateDate = calculateVacateDate(isImmediateVacate, currentStay.noticePeriodInDays);

        // Create snapshots
        const stayHistoryEntry = createStayHistoryEntry(currentStay, vacateDate);
        const currentStaySnapshot = createCurrentStaySnapshot(currentStay);

        // Prepare tenant update (using MongoDB transaction for consistency)
        const session = await Tenant.startSession();

        try {
            await session.withTransaction(async () => {

                // Update tenant status
                const tenantUpdate = {
                    isInNoticePeriod: !isImmediateVacate && !isVacatedAlready,
                    noticePeriodStartDate: !isImmediateVacate && !isVacatedAlready ? new Date() : null,
                    noticePeriodEndDate: !isImmediateVacate && !isVacatedAlready ? vacateDate : null,
                    updatedAt: new Date(),
                    $push: { stayHistory: stayHistoryEntry },
                };

                // For immediate vacate, set status to inactive and clear currentStay
                if (isImmediateVacate || isVacatedAlready) {
                    tenantUpdate.status = 'inactive';
                    tenantUpdate.currentStay = {
                        propertyPpid: null,
                        propertyName: null,
                        roomPpid: null,
                        bedId: null,
                        rent: null,
                        deposit: null,
                        assignedAt: null,
                        noticePeriodInMonths: 0,
                        isInNoticePeriod: false,
                        location: null,
                    };
                    tenantUpdate.isInNoticePeriod = false;
                } else {
                    tenantUpdate['currentStay.isInNoticePeriod'] = true;
                }

                const updatedTenant = await Tenant.findByIdAndUpdate(
                    tenant._id,
                    tenantUpdate,
                    { new: true, session }
                );

                if (!updatedTenant) {
                    throw new Error('Failed to update tenant');
                }

                let depositMessageForTenant = deposit > 0 && !isDepositRefunded
                    ? `INR ${deposit} deposit will be ${isImmediateVacate ? 'forfeited' : 'returned after vacate date'}`
                    : 'No deposit to return';

                if ((isVacatedAlready || isImmediateVacate) && !isDepositRefunded && (deposit > currentStay.rentDue)) {
                    depositMessageForTenant = `INR ${deposit - currentStay.rentDue} deposit will be returned, please contact owner for details`;
                }

                let depositMessageForOwner = deposit > 0 && !isDepositRefunded
                    ? `INR ${deposit} deposit ${isImmediateVacate ? 'can be forfeited' : 'should be returned after vacate date'}`
                    : 'No deposit to return';

                if ((isVacatedAlready || isImmediateVacate) && !isDepositRefunded && (deposit > currentStay.rentDue)) {
                    depositMessageForOwner = `INR ${deposit - currentStay.rentDue} deposit should be returned to tenant, please contact tenant for details`;
                }

                // Create vacate request
                const vacateData = {
                    name: tenant.name,
                    tenantId: tenant.pgpalId,
                    phone: tenant.phone,
                    aadhar: tenant.aadhar,
                    propertyId: currentStay.propertyPpid,
                    propertyName: property.name,
                    roomId: currentStay.roomPpid,
                    bedId: currentStay.bedId,
                    isImmediateVacate,
                    vacateDate,
                    noticePeriodStartDate: !isImmediateVacate && !isVacatedAlready ? new Date() : null,
                    noticePeriodEndDate: vacateDate,
                    reason,
                    tenantDepositInfo: depositMessageForTenant,
                    ownerDepositInfo: depositMessageForOwner,
                    status: isImmediateVacate ? 'completed' : 'noticeperiod',
                    createdBy: username,
                    removedByOwner: true,
                    previousSnapshot: currentStaySnapshot,
                    vacateRaisedAt: new Date(),
                    withdrawWindow: isImmediateVacate ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                };

                const vacateRequest = await Vacates.create([vacateData], { session });
                if (!vacateRequest || vacateRequest.length === 0) {
                    throw new Error('Failed to create vacate request');
                }

                // Handle bed status changes
                if (isImmediateVacate || isVacatedAlready) {
                    // Clear bed immediately
                    const clearBedResponse = await clearBed(
                        currentStay.roomPpid,
                        currentStay.bedId,
                        currentUser
                    );
                    if (!clearBedResponse) {
                        throw new Error('Failed to clear bed');
                    }
                } else {
                    // Set bed to notice period
                    const changeBedResponse = await changeBedStatus(
                        currentStay.roomPpid,
                        currentStay.bedId,
                        'noticeperiod',
                        currentUser
                    );
                    if (!changeBedResponse) {
                        throw new Error('Failed to change bed status to notice period');
                    }
                }

                return { updatedTenant, vacateRequest: vacateRequest[0] };
            });

        } finally {
            await session.endSession();
        }

        // Send notifications
        const vacateRequest = await Vacates.findOne({ tenantId: tenant.pgpalId }).sort({ createdAt: -1 });
        await notifyVacateRemoved(vacateRequest, currentUser, property);

        // Clear cache
        await invalidateCacheByPattern(`*${currentStay.propertyPpid}*`);
        if (property?._id) {
            await invalidateCacheByPattern(`*${property._id}*`);
        }

        // Prepare response messages
        const withdrawWindow = isImmediateVacate ? '24 hours' : '7 days';
        const depositMessage = deposit > 0 && !isDepositRefunded
            ? `INR ${deposit} deposit will be ${isImmediateVacate ? 'forfeited' : 'returned after vacate date'}`
            : 'No deposit to return';

        res.status(201).json({
            message: 'Tenant removed successfully',
            vacateRequest,
            details: {
                vacateDate: vacateDate.toDateString(),
                withdrawWindow: `Request can be withdrawn within ${withdrawWindow}`,
                depositInfo: depositMessage,
                status: isImmediateVacate ? 'Immediate removal - effective now' : 'Notice period started'
            }
        });

    } catch (err) {
        console.error('Error in removeTenant:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.retainTenant = async (req, res) => {
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
    if (role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can retain tenants' });
    }

    const { _id: userId } = currentUser.data.user;
    const { vacateId } = req.params;

    try {
        // Input validation
        if (!vacateId) {
            return res.status(400).json({ error: 'Vacate ID is required' });
        }

        // Get active vacate request
        const vacate = await Vacates.findById(vacateId);
        if (!vacate) {
            return res.status(404).json({ error: 'Vacate request not found' });
        }

        if (!vacate.removedByOwner) {
            return res.status(400).json({
                error: 'This request was raised by tenant, please ask tenant to withdraw request'
            });
        }

        // Get tenant profile
        const tenant = await getTenantProfile(vacate.tenantId);

        if (!tenant.isInNoticePeriod) {
            return res.status(400).json({ error: 'Tenant is not in notice period' });
        }

        // Validate property ownership
        const property = await validatePropertyOwnership(vacate.propertyId, userId, currentUser);

        // 1. Check vacateRaisedAt is within 7 days
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        if (now - new Date(vacate.vacateRaisedAt).getTime() > oneWeekMs) {
            return res.status(400).json({ error: 'Withdraw window expired (more than one week).' });
        }

        // 2. Check tenant is in notice period
        if (!tenant.isInNoticePeriod) {
            return res.status(400).json({ error: 'Tenant is not in notice period.' });
        }

        // 3. Check bed is not occupied by another tenant
        const bedOccupied = await Tenant.findOne({
            'currentStay.roomPpid': vacate.roomId,
            'currentStay.bedId': vacate.bedId,
            pgpalId: { $ne: vacate.tenantId },
            status: 'active'
        });
        if (bedOccupied) {
            return res.status(400).json({ error: 'Bed is already occupied by another tenant.' });
        }

        // Use transaction for data consistency
        const session = await Tenant.startSession();

        try {
            await session.withTransaction(async () => {
                const previousSnapshot = vacate.previousSnapshot;
                // console.log('Previous Snapshot:', previousSnapshot);

                // Restore tenant to active status
                const restoredCurrentStay = {
                    propertyPpid: previousSnapshot.propertyPpid,
                    propertyName: previousSnapshot.propertyName,
                    roomPpid: previousSnapshot.roomPpid,
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
                    location: previousSnapshot.location
                };

                // Remove the latest stay history entry (the vacate entry)
                const updatedStayHistory = tenant.stayHistory.filter(stay =>
                    !(stay.to && new Date(stay.to).getTime() === new Date(vacate.vacateDate).getTime())
                );

                const tenantUpdate = {
                    status: 'active',
                    currentStay: restoredCurrentStay,
                    isInNoticePeriod: false,
                    noticePeriodStartDate: null,
                    noticePeriodEndDate: null,
                    stayHistory: updatedStayHistory,
                    updatedAt: new Date(),
                };

                // Update tenant
                const updatedTenant = await Tenant.findByIdAndUpdate(
                    tenant._id,
                    tenantUpdate,
                    { new: true, session }
                );

                if (!updatedTenant) {
                    throw new Error('Failed to update tenant');
                }

                // Reassign bed
                const assignBedResponse = await assignBed(
                    previousSnapshot.roomPpid,
                    previousSnapshot.bedId,
                    tenant.phone,
                    previousSnapshot.rent,
                    tenant.pgpalId,
                    currentUser
                );

                console.log(previousSnapshot.roomPpid, previousSnapshot.bedId, tenant.phone, previousSnapshot.rent, tenant.pgpalId);

                if (!assignBedResponse) {
                    throw new Error('Failed to reassign bed');
                }

                // Mark vacate request as withdrawn (don't delete, keep for audit)
                const updatedVacate = await Vacates.findByIdAndUpdate(
                    vacate._id,
                    {
                        status: 'withdrawn',
                        withdrawnAt: new Date(),
                        withdrawnBy: currentUser.data.user.username,
                        tenantDepositInfo: `Tenant retained. Bed: ${vacate.bedId} is now active.`,
                        ownerDepositInfo: `Tenant retained. Bed: ${vacate.bedId} is now active.`,
                    },
                    { new: true, session }
                );

                if (!updatedVacate) {
                    throw new Error('Failed to update vacate request');
                }

                return { updatedTenant, updatedVacate };
            });

        } finally {
            await session.endSession();
        }

        // Send notifications
        await notifyVacateWithdrawnOrRetained('retained', vacate, currentUser, property);

        // Clear cache
        await invalidateCacheByPattern(`*${vacate.propertyId}*`);
        if (property?._id) {
            await invalidateCacheByPattern(`*${property._id}*`);
        }

        res.status(200).json({
            message: 'Tenant retained successfully',
            details: {
                status: 'Tenant stay has been restored to active',
                bedId: vacate.bedId,
                retainedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error('Error in retainTenant:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.getVacateHistoryByProperty = async (req, res) => {
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
    if (role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can view vacate history' });
    }

    const { pppid: propertyId } = req.params;

    try {
        const query = {};
        if (propertyId) query.propertyId = propertyId;

        const vacates = await Vacates.find(query)
            .sort({ createdAt: -1 });

        if (!vacates || vacates.length === 0) {
            return res.status(404).json({
                error: 'No vacate history found',
                query: { propertyId }
            });
        }

        res.status(200).json({
            count: vacates.length,
            vacateHistory: vacates
        });

    } catch (err) {
        console.error('Error in getVacateHistory:', err);
        res.status(500).json({ error: err.message });
    }
};

// In ownerVacateController.js
exports.approveImmediateVacate = async (req, res) => {
    const { vacateId } = req.params;
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) return res.status(401).json({ error: 'Unauthorized' });

    let currentUser;
    try { currentUser = JSON.parse(xUserHeader); } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (currentUser.data.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can approve vacate' });
    }

    const session = await Tenant.startSession();
    try {
        await session.withTransaction(async () => {
            // 1. Find the vacate request
            const vacate = await Vacates.findById(vacateId).session(session);
            if (!vacate || vacate.status !== 'pending_owner_approval') {
                throw new Error('No pending approval for this vacate request');
            }

            // 2. Find the tenant
            const tenant = await Tenant.findOne({ pgpalId: vacate.tenantId }).session(session);
            if (!tenant) throw new Error('Tenant not found');

            // 3. Update tenant: set inactive, clear currentStay, etc.
            const tenantUpdate = {
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
                    isInNoticePeriod: false,
                    location: null,
                },
                isInNoticePeriod: false,
                noticePeriodStartDate: null,
                noticePeriodEndDate: null,
                updatedAt: new Date(),
                $push: {
                    stayHistory: {
                        propertyId: vacate.propertyId,
                        propertyName: vacate.propertyName,
                        roomId: vacate.roomId,
                        bedId: vacate.bedId,
                        rent: vacate.previousSnapshot?.rent,
                        deposit: vacate.previousSnapshot?.deposit,
                        from: vacate.previousSnapshot?.assignedAt,
                        to: vacate.vacateDate,
                        createdAt: new Date()
                    }
                }
            };
            const updatedTenant = await Tenant.findByIdAndUpdate(
                tenant._id,
                tenantUpdate,
                { new: true, session }
            );
            if (!updatedTenant) throw new Error('Failed to update tenant');

            // 4. Clear the bed
            const clearBedResponse = await clearBed(
                vacate.roomId,
                vacate.bedId,
                currentUser
            );
            if (!clearBedResponse) throw new Error('Failed to clear bed');

            // 5. Update vacate request status
            vacate.status = 'completed';
            vacate.approvedByOwnerAt = new Date();
            await vacate.save({ session });

            const userId = currentUser.data.user._id;
            const property = await validatePropertyOwnership(vacate.propertyId, userId, currentUser);

            //invalidate cache
            await invalidateCacheByPattern(`*${vacate.propertyId}*`);

            await notifyVacateApproved(vacate, currentUser, property);
        });


        res.status(200).json({ message: 'Vacate approved and processed.' });
    } catch (err) {
        console.error('Error in approveImmediateVacate:', err);
        res.status(500).json({ error: err.message });
    } finally {
        await session.endSession();
    }
};

exports.rejectImmediateVacate = async (req, res) => {
    const { vacateId } = req.params;
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) return res.status(401).json({ error: 'Unauthorized' });

    let currentUser;
    try { currentUser = JSON.parse(xUserHeader); } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (currentUser.data.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can reject vacate' });
    }

    const session = await Tenant.startSession();
    try {
        await session.withTransaction(async () => {
            const vacate = await Vacates.findById(vacateId).session(session);
            if (!vacate || vacate.status !== 'pending_owner_approval') {
                throw new Error('No pending approval for this vacate request');
            }

            vacate.status = 'rejected';
            vacate.rejectedByOwnerAt = new Date();
            vacate.rejectedBy = currentUser.data.user.username;
            await vacate.save({ session });

            const userId = currentUser.data.user._id;
            const property = await validatePropertyOwnership(vacate.propertyId, userId, currentUser);

            // Invalidate cache
            await invalidateCacheByPattern(`*${vacate.propertyId}*`);


            await notifyVacateRejected(vacate, currentUser, property);
        });

        res.status(200).json({ message: 'Vacate request rejected.' });
    } catch (err) {
        console.error('Error in rejectImmediateVacate:', err);
        res.status(500).json({ error: err.message });
    } finally {
        await session.endSession();
    }
};

exports.removeAllTenantsFromProperty = async (req, res) => {
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
    if (role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can remove tenants' });
    }

    const { propertyPpid } = req.params;
    const { reason = 'Property deletion - bulk tenant removal' } = req.body;

    // Input validation
    if (!propertyPpid) {
        console.log(`[removeAllTenantsFromProperty] Missing property PPID: ${propertyPpid}`);
        return res.status(400).json({ error: 'Property PPID is required' });
    }

    try {
        // Get all active tenants from the property
        const tenants = await Tenant.find({
            'currentStay.propertyPpid': propertyPpid,
            status: 'active'
        });

        if (!tenants || tenants.length === 0) {
            return res.status(200).json({
                message: 'No active tenants found in this property',
                removedCount: 0,
                details: []
            });
        }

        // Validate property ownership for the first tenant (assuming all tenants belong to same property)
        const property = await validatePropertyOwnership(
            propertyPpid,
            currentUser.data.user._id,
            currentUser
        );


        // Process all tenants in parallel using Promise.all
        const tenantProcessingPromises = tenants.map(async (tenant) => {
            const session = await Tenant.startSession();

            try {
                return await session.withTransaction(async () => {
                    // Validate tenant eligibility
                    validateTenantRemovalEligibility(tenant);

                    const currentStay = tenant.currentStay;
                    const deposit = currentStay.deposit || 0;
                    const isImmediateVacate = true;
                    const isDepositRefunded = false;

                    // Calculate vacate date (immediate)
                    const vacateDate = new Date();

                    // Create snapshots
                    const stayHistoryEntry = createStayHistoryEntry(currentStay, vacateDate);
                    const currentStaySnapshot = createCurrentStaySnapshot(currentStay);

                    // Update tenant status (immediate vacate)
                    const tenantUpdate = {
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
                            isInNoticePeriod: false,
                            location: null,
                        },
                        isInNoticePeriod: false,
                        noticePeriodStartDate: null,
                        noticePeriodEndDate: null,
                        updatedAt: new Date(),
                        $push: { stayHistory: stayHistoryEntry },
                    };

                    const updatedTenant = await Tenant.findByIdAndUpdate(
                        tenant._id,
                        tenantUpdate,
                        { new: true, session }
                    );

                    if (!updatedTenant) {
                        throw new Error(`Failed to update tenant ${tenant.pgpalId}`);
                    }

                    // Prepare deposit messages
                    let depositMessageForTenant = deposit > 0 && !isDepositRefunded
                        ? `INR ${deposit} deposit will be forfeited due to immediate property closure`
                        : 'No deposit to return';

                    if (!isDepositRefunded && (deposit > currentStay.rentDue)) {
                        depositMessageForTenant = `INR ${deposit - currentStay.rentDue} deposit will be returned, please contact owner for details`;
                    }

                    let depositMessageForOwner = deposit > 0 && !isDepositRefunded
                        ? `INR ${deposit} deposit can be forfeited due to property closure`
                        : 'No deposit to return';

                    if (!isDepositRefunded && (deposit > currentStay.rentDue)) {
                        depositMessageForOwner = `INR ${deposit - currentStay.rentDue} deposit should be returned to tenant, please contact tenant for details`;
                    }

                    // Create vacate request
                    const vacateData = {
                        name: tenant.name,
                        tenantId: tenant.pgpalId,
                        phone: tenant.phone,
                        aadhar: tenant.aadhar,
                        propertyId: currentStay.propertyPpid,
                        propertyName: property.name,
                        roomId: currentStay.roomPpid,
                        bedId: currentStay.bedId,
                        isImmediateVacate: true,
                        vacateDate,
                        noticePeriodStartDate: null,
                        noticePeriodEndDate: vacateDate,
                        reason,
                        tenantDepositInfo: depositMessageForTenant,
                        ownerDepositInfo: depositMessageForOwner,
                        status: 'completed',
                        createdBy: currentUser.data.user.username,
                        removedByOwner: true,
                        previousSnapshot: currentStaySnapshot,
                        vacateRaisedAt: new Date(),
                        withdrawWindow: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                    };

                    const vacateRequest = await Vacates.create([vacateData], { session });
                    if (!vacateRequest || vacateRequest.length === 0) {
                        throw new Error(`Failed to create vacate request for tenant ${tenant.pgpalId}`);
                    }

                    // Clear bed immediately
                    const clearBedResponse = await clearBed(
                        currentStay.roomPpid,
                        currentStay.bedId,
                        currentUser
                    );
                    if (!clearBedResponse) {
                        throw new Error(`Failed to clear bed for tenant ${tenant.pgpalId}`);
                    }

                    return {
                        tenantId: tenant.pgpalId,
                        tenantName: tenant.name,
                        vacateRequest: vacateRequest[0],
                        success: true
                    };
                });
            } catch (error) {
                return {
                    tenantId: tenant.pgpalId,
                    tenantName: tenant.name,
                    error: error.message,
                    success: false
                };
            } finally {
                await session.endSession();
            }
        });

        // Execute all tenant processing in parallel
        const results = await Promise.all(tenantProcessingPromises);

        // Separate successful and failed operations
        const successfulRemovals = results.filter(result => result.success);
        const failedRemovals = results.filter(result => !result.success);

        // Send bulk notifications for successful removals
        if (successfulRemovals.length > 0) {
            try {
                const vacateRequestsForNotification = successfulRemovals.map(result => result.vacateRequest);
                await notifyBulkVacateRemoved(vacateRequestsForNotification, currentUser, property);
            } catch (error) {
                console.error('Failed to send bulk notifications:', error);
            }
        }

        // Clear cache
        await invalidateCacheByPattern(`*${propertyPpid}*`);
        if (property?._id) {
            await invalidateCacheByPattern(`*${property._id}*`);
        }

        // Prepare response
        const response = {
            message: `Bulk tenant removal completed for property ${propertyPpid}`,
            totalTenants: tenants.length,
            successfulRemovals: successfulRemovals.length,
            failedRemovals: failedRemovals.length,
            details: {
                successful: successfulRemovals.map(result => ({
                    tenantId: result.tenantId,
                    tenantName: result.tenantName,
                    vacateDate: result.vacateRequest.vacateDate.toDateString(),
                    withdrawWindow: '24 hours',
                    status: 'Immediate removal - effective now'
                })),
                failed: failedRemovals.map(result => ({
                    tenantId: result.tenantId,
                    tenantName: result.tenantName,
                    error: result.error
                }))
            }
        };

        // Return appropriate status code
        if (failedRemovals.length === 0) {
            res.status(200).json(response);
        } else if (successfulRemovals.length === 0) {
            console.log('All tenant removals failed:', failedRemovals.map(r => r.error));
            res.status(400).json(response);
        } else {
            res.status(207).json(response); // Multi-status for partial success
        }

    } catch (err) {
        console.error('Error in removeAllTenantsFromProperty:', err);
        res.status(500).json({
            error: 'Internal server error during bulk tenant removal',
            details: err.message
        });
    }
};