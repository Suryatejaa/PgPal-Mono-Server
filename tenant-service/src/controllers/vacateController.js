//vacateController.js

const { clearBed, assignBed } = require('./internalApis');
const Vacates = require('../models/vacatesModel');
const Tenant = require('../models/tenantModel');
const CacheHelper = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const { getOwnProperty, changeBedStatus } = require('./internalApis.js');
const {
    getTenantProfile,
    validateVacateEligibility,
    calculateVacateDate,
    createStayHistoryEntry,
    createCurrentStaySnapshot
} = require('./vacateUtilFunctions.js');

const {
    notifyVacateRaised,
    notifyVacateWithdrawnOrRetained
} = require('../utils/vacateNotifications');


exports.raiseVacate = async (req, res) => {
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
    if (role !== 'tenant') {
        return res.status(403).json({ error: 'Only tenants can raise vacate request' });
    }

    const { pgpalId, phone, _id, username } = currentUser.data.user;
    const { reason, isImmediateVacate, isVacatedAlready, isDepositRefunded } = req.body;

    // Input validation
    if (!reason || typeof isImmediateVacate !== 'boolean') {
        return res.status(400).json({
            error: 'Both reason and isImmediateVacate are required and isImmediateVacate must be boolean.'
        });
    }

    let vacateStatus = 'noticeperiod';
    if (isImmediateVacate || isVacatedAlready) {
        vacateStatus = 'pending_owner_approval';
    }

    try {
        // Get tenant profile
        const tenant = await getTenantProfile({ phone, pgpalId, _id });

        // Validate eligibility
        validateVacateEligibility(tenant);

        const currentStay = tenant.currentStay;
        const deposit = currentStay.deposit || 0;

        // Validate immediate vacate logic
        if ((isImmediateVacate || isVacatedAlready) && (!deposit || deposit <= 0)) {
            return res.status(400).json({
                error: 'You cannot vacate immediately without deposit. Please contact owner.'
            });
        }

        if ((isVacatedAlready || isImmediateVacate) && (currentStay.rentPaidStatus !== 'paid' || currentStay.rentDue > 0)) {
            return res.status(400).json({
                error: 'You cannot vacate immediately without paying all dues. Please clear your dues first or serve notice period.'
            });
        }

        if ((isVacatedAlready || isImmediateVacate) && !isDepositRefunded && (deposit > 0 && currentStay.rentDue > deposit)) {
            return res.status(400).json({
                error: 'You cannot vacate without clearing dues. Please contact owner.'
            });
        }

        // Calculate vacate date
        const vacateDate = calculateVacateDate(isImmediateVacate, currentStay.noticePeriodInDays);

        // Create snapshots
        const stayHistoryEntry = createStayHistoryEntry(currentStay, vacateDate);
        const currentStaySnapshot = createCurrentStaySnapshot(currentStay);

        // Prepare tenant update (using MongoDB transaction for consistency)
        const session = await Tenant.startSession();

        try {
            await session.withTransaction(async () => {
                let updatedTenant = null;

                // Only update tenant and bed for notice period
                if (!(isImmediateVacate || isVacatedAlready)) {
                    // Update tenant for notice period
                    const tenantUpdate = {
                        isInNoticePeriod: true,
                        noticePeriodStartDate: new Date(),
                        noticePeriodEndDate: vacateDate,
                        updatedAt: new Date(),
                        $push: { stayHistory: stayHistoryEntry },
                        'currentStay.isInNoticePeriod': true
                    };

                    updatedTenant = await Tenant.findByIdAndUpdate(
                        tenant._id,
                        tenantUpdate,
                        { new: true, session }
                    );

                    if (!updatedTenant) {
                        throw new Error('Failed to update tenant');
                    }

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

                // Prepare deposit info messages
                let depositMessageForTenant = deposit > 0 && !isDepositRefunded
                    ? `INR ${deposit} deposit will be ${isImmediateVacate ? 'forfeited' : 'returned after vacate date'} if you clear INR.${currentStay.rentDue} dues`
                    : 'No deposit to return';

                if ((isVacatedAlready || isImmediateVacate) && !isDepositRefunded && (deposit > currentStay.rentDue)) {
                    depositMessageForTenant = `INR ${deposit - currentStay.rentDue} deposit will be returned, please contact owner for details`;
                }

                let depositMessageForOwner = deposit > 0 && !isDepositRefunded
                    ? `INR ${deposit} deposit ${isImmediateVacate ? 'can be forfeited' : 'should be returned after vacate date'} if tenant clears dues`
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
                    propertyName: currentStay.propertyName,
                    roomId: currentStay.roomPpid,
                    bedId: currentStay.bedId,
                    isImmediateVacate,
                    vacateDate,
                    noticePeriodStartDate: new Date(),
                    noticePeriodEndDate: vacateDate,
                    reason,
                    tenantDepositInfo: depositMessageForTenant,
                    ownerDepositInfo: depositMessageForOwner,
                    status: vacateStatus,
                    createdBy: username,
                    previousSnapshot: currentStaySnapshot,
                    vacateRaisedAt: new Date(),
                    withdrawWindow: isImmediateVacate ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                };

                const vacateRequest = await Vacates.create([vacateData], { session });
                if (!vacateRequest || vacateRequest.length === 0) {
                    throw new Error('Failed to create vacate request');
                }

                // For immediate/force vacate, do NOT clear bed or set tenant inactive here!
                // Wait for owner approval.

                return { updatedTenant, vacateRequest: vacateRequest[0] };
            });

        } finally {
            await session.endSession();
        }

        // Get property details for notifications
        const property = await getOwnProperty(currentStay.propertyPpid, currentUser, true);

        // Send notifications
        const vacateRequest = await Vacates.findOne({ tenantId: tenant.pgpalId }).sort({ createdAt: -1 });
        await notifyVacateRaised(vacateRequest, currentUser, property);

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
            message: 'Vacate request created successfully',
            vacateRequest,
            details: {
                vacateDate: vacateDate.toDateString(),
                withdrawWindow: `You can withdraw this request within ${withdrawWindow}`,
                depositInfo: depositMessage,
                status: isImmediateVacate ? 'Pending owner approval' : 'Notice period started'
            }
        });

    } catch (err) {
        console.error('Error in raiseVacate:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.withdrawVacate = async (req, res) => {
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
    if (role !== 'tenant') {
        return res.status(403).json({ error: 'Only tenants can withdraw vacate request' });
    }

    const { pgpalId, phone, _id } = currentUser.data.user;

    try {
        // Get tenant profile
        const tenant = await getTenantProfile({ phone, pgpalId, _id });

        // Get active vacate request
        const vacate = await Vacates.findOne({
            tenantId: tenant.pgpalId,
            status: { $in: ['noticeperiod', 'pending'] }
        }).sort({ createdAt: -1 });

        if (!vacate) {
            return res.status(404).json({ error: 'No active vacate request found' });
        }

        // Validate withdrawal eligibility
        if (vacate.removedByOwner) {
            return res.status(400).json({
                error: 'This tenant was removed by the owner, please check with owner'
            });
        }

        if (vacate.status === 'withdrawn') {
            return res.status(400).json({ error: 'Vacate request is already withdrawn' });
        }

        if (vacate.status === 'completed' || vacate.isImmediateVacate || vacate.status === 'pending_owner_approval') {
            return res.status(400).json({ error: 'Cannot withdraw immediate or pending approval vacate request.' });
        }

        // Check withdrawal window
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
                    noticePeriodInDays: previousSnapshot.noticePeriodInDays,
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
                        tenantDepositInfo: `Vacate request withdrawn. Bed: ${vacate.bedId} is now active.`,
                        ownerDepositInfo: `Vacate request withdrawn. Bed: ${vacate.bedId} is now active.`,
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

        // Get property for notifications
        const property = await getOwnProperty(vacate.propertyId, currentUser, true);

        // Send notifications
        await notifyVacateWithdrawnOrRetained('withdrawn', vacate, currentUser, property);
        // Clear cache
        await invalidateCacheByPattern(`*${vacate.propertyId}*`);
        if (property?._id) {
            await invalidateCacheByPattern(`*${property._id}*`);
        }

        res.status(200).json({
            message: 'Vacate request withdrawn successfully',
            details: {
                status: 'Your stay has been restored to active',
                bedId: vacate.bedId,
                withdrawnAt: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error('Error in withdrawVacate:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.getVacateRequests = async (req, res) => {
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
    if (role !== 'tenant' && role !== 'owner') {
        return res.status(403).json({ error: 'Only tenants and owners can view vacate requests' });
    }

    const { tenantId, propertyId } = req.params;

    try {
        const query = {};
        if (tenantId) query.tenantId = tenantId;
        if (propertyId) query.propertyId = propertyId;

        const vacates = await Vacates.find(query)
            .sort({ createdAt: -1 })
            .select('-previousSnapshot'); // Exclude sensitive snapshot data from list view

        if (!vacates || vacates.length === 0) {
            return res.status(404).json({
                error: 'No vacate requests found',
                query: { tenantId, propertyId }
            });
        }

        res.status(200).json({
            count: vacates.length,
            vacateRequests: vacates
        });

    } catch (err) {
        console.error('Error in getVacateRequests:', err);
        res.status(500).json({ error: err.message });
    }
};
