const Tenant = require('../models/tenantModel.js');
const { getOwnProperty } = require('./internalApis.js');
const notificationQueue = require('../utils/notificationQueue.js');

// Get tenant profile by phone, pgpalId, or _id
async function getTenantProfile(userIdentifiers) {
    if (typeof userIdentifiers === 'string') {
        // For owner controller (pgpalId)
        return await Tenant.findOne({
            pgpalId: { $regex: `^${userIdentifiers}$`, $options: 'i' }
        });
    }
    // For tenant controller (object)
    const { phone, pgpalId, _id } = userIdentifiers;
    return await Tenant.findOne({
        $or: [{ phone }, { pgpalId }, { _id }]
    });
}

// Validate tenant eligibility for vacate
function validateVacateEligibility(tenant) {
    if (tenant.status === 'inactive') throw new Error('Tenant is already inactive');
    if (tenant.isInNoticePeriod) throw new Error('Tenant is already in notice period');
    if (!tenant.currentStay || !tenant.currentStay.propertyPpid) throw new Error('Tenant has no active stay');
}

// Validate tenant eligibility for removal
function validateTenantRemovalEligibility(tenant) {
    if (tenant.status === 'inactive') throw new Error('Tenant is already inactive');
    if (tenant.isInNoticePeriod) throw new Error('Tenant is already in notice period');
    if (!tenant.currentStay || !tenant.currentStay.propertyPpid) throw new Error('Tenant has no active stay');
}

// Validate property ownership
async function validatePropertyOwnership(propertyPpid, userId, currentUser) {
    const property = await getOwnProperty(propertyPpid, currentUser, true);
    if (!property) throw new Error('Property not found');
    if (property.ownerId.toString() !== userId) throw new Error('You do not own this property');
    return property;
}

// Calculate vacate date
function calculateVacateDate(isImmediateVacate, noticePeriodInDays) {
    if (isImmediateVacate) return new Date();
    const noticePeriodDays = noticePeriodInDays || 1;
    return new Date(Date.now() + noticePeriodDays * 24 * 60 * 60 * 1000);
}

// Create stay history entry
function createStayHistoryEntry(currentStay, vacateDate) {
    return {
        propertyId: currentStay.propertyPpid,
        propertyName: currentStay.propertyName,
        roomId: currentStay.roomPpid,
        bedId: currentStay.bedId,
        rent: currentStay.rent,
        deposit: currentStay.deposit,
        from: currentStay.assignedAt,
        to: vacateDate,
        createdAt: new Date()
    };
}

// Create current stay snapshot
function createCurrentStaySnapshot(currentStay) {
    return {
        propertyPpid: currentStay.propertyPpid,
        propertyName: currentStay.propertyName,
        roomPpid: currentStay.roomPpid,
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
        location: currentStay.location,
    };
}

// Send notifications (generic, can be extended)
async function sendNotifications(notifications) {
    for (const notification of notifications) {
        try {
            await notificationQueue.add('notifications', notification, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 }
            });
        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }
    }
}

module.exports = {
    getTenantProfile,
    validateVacateEligibility,
    validateTenantRemovalEligibility,
    validatePropertyOwnership,
    calculateVacateDate,
    createStayHistoryEntry,
    createCurrentStaySnapshot,
};