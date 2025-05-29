const notificationQueue = require('./notificationQueue.js');

// Notify owner and tenant when a vacate is raised (pending approval or noticeperiod)
async function notifyVacateRaised(vacateData, currentUser, property) {
    console.log('called notifyVacateRaised', vacateData);
    const notifications = [];
    if (vacateData.status === 'pending_owner_approval') {
        // Notify owner for approval
        if (property && property.ownerId) {
            notifications.push({
                ownerId: property.ownerId,
                propertyPpid: vacateData.propertyId,
                audience: 'owner',
                title: 'Immediate Vacate Request',
                message: `Tenant ${vacateData.name} has requested immediate vacate for bed ${vacateData.bedId}. Please review and approve.`,
                type: 'info',
                method: ['in-app', 'email'],
                meta: { vacateId: vacateData._id },
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            });
        }
        // Notify tenant that approval is pending
        notifications.push({
            tenantId: vacateData.tenantId,
            propertyPpid: vacateData.propertyId,
            audience: 'tenant',
            title: 'Vacate Request Pending Approval',
            message: 'Your immediate vacate request is pending owner approval. You will be notified once approved.',
            type: 'info',
            method: ['in-app', 'email'],
            meta: { vacateId: vacateData._id },
            createdBy: currentUser?.data?.user?.pgpalId || 'system'
        });
    } else if (vacateData.status === 'noticeperiod') {
        // Notify owner and tenant for notice period
        if (property && property.ownerId) {
            notifications.push({
                ownerId: property.ownerId,
                propertyPpid: vacateData.propertyId,
                audience: 'owner',
                title: 'Vacate Notice Period Started',
                message: `Tenant ${vacateData.name} has started their notice period for bed ${vacateData.bedId}.`,
                type: 'info',
                method: ['in-app'],
                meta: { vacateId: vacateData._id },
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            });
        }
        notifications.push({
            tenantId: vacateData.tenantId,
            propertyPpid: vacateData.propertyId,
            audience: 'tenant',
            title: 'Notice Period Started',
            message: 'Your notice period has started. Please vacate by the end date.',
            type: 'info',
            method: ['in-app'],
            meta: { vacateId: vacateData._id },
            createdBy: currentUser?.data?.user?.pgpalId || 'system'
        });
    }
    await sendNotifications(notifications);
}

// Notify tenant and owner when vacate is approved
async function notifyVacateApproved(vacateData, currentUser, property) {
    console.log('first notifyVacateApproved',vacateData);
    const notifications = [];
    notifications.push({
        tenantId: vacateData.tenantId,
        propertyPpid: vacateData.propertyId,
        audience: 'tenant',
        title: 'Vacate Request Approved',
        message: 'Your immediate vacate request has been approved by the owner. Your stay is now ended.',
        type: 'info',
        method: ['in-app', 'email'],
        meta: { vacateId: vacateData._id },
        createdBy: currentUser?.data?.user?.pgpalId || 'system'
    });
    if (property && property.ownerId) {
        notifications.push({
            ownerId: property.ownerId,
            propertyPpid: vacateData.propertyId,
            audience: 'owner',
            title: 'Vacate Request Approved',
            message: `You have approved the immediate vacate request for bed ${vacateData.bedId}.`,
            type: 'info',
            method: ['in-app'],
            meta: { vacateId: vacateData._id },
            createdBy: currentUser?.data?.user?.pgpalId || 'system'
        });
    }
    await sendNotifications(notifications);
}

// Notify tenant and owner when vacate is rejected
async function notifyVacateRejected(vacateData, currentUser, property) {
    console.log('called notifyVacateRejected',vacateData);
    const notifications = [];
    notifications.push({
        tenantId: vacateData.tenantId,
        propertyPpid: vacateData.propertyId,
        audience: 'tenant',
        title: 'Vacate Request Rejected',
        message: 'Your immediate vacate request has been rejected by the owner. Please contact the owner for details.',
        type: 'info',
        method: ['in-app', 'email'],
        meta: { vacateId: vacateData._id },
        createdBy: currentUser?.data?.user?.pgpalId || 'system'
    });
    if (property && property.ownerId) {
        notifications.push({
            ownerId: property.ownerId,
            propertyPpid: vacateData.propertyId,
            audience: 'owner',
            title: 'Vacate Request Rejected',
            message: `You have rejected the immediate vacate request for bed ${vacateData.bedId}.`,
            type: 'vacate_rejected',
            method: ['in-app'],
            meta: { vacateId: vacateData._id },
            createdBy: currentUser?.data?.user?.pgpalId || 'system'
        });
    }
    await sendNotifications(notifications);
}

// Notify on withdrawn or retained
async function notifyVacateWithdrawnOrRetained(type, vacateData, currentUser, property) {
    console.log('called notifyVacateWithdrawnOrRetained',vacateData, type);
    const notifications = [];
    if (type === 'withdrawn') {
        if (property && property.ownerId) {
            notifications.push({
                ownerId: property.ownerId,
                propertyPpid: vacateData.propertyId,
                audience: 'owner',
                title: 'Vacate Request Withdrawn',
                message: `Bed: ${vacateData.bedId} has withdrawn their vacate request.`,
                type: 'info',
                method: ['in-app'],
                meta: { vacateId: vacateData._id },
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            });
        }
        notifications.push({
            tenantId: vacateData.tenantId,
            propertyPpid: vacateData.propertyId,
            audience: 'tenant',
            title: 'Vacate Request Withdrawn',
            message: 'Your vacate request has been withdrawn and your stay is active.',
            type: 'info',
            method: ['in-app'],
            meta: { vacateId: vacateData._id },
            createdBy: currentUser?.data?.user?.pgpalId || 'system'
        });
    } else if (type === 'retained') {
        if (property && property.ownerId) {
            notifications.push({
                ownerId: property.ownerId,
                propertyPpid: vacateData.propertyId,
                audience: 'owner',
                title: 'Tenant Retained',
                message: `Tenant for bed: ${vacateData.bedId} has been retained and is active.`,
                type: 'info',
                method: ['in-app'],
                meta: { vacateId: vacateData._id },
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            });
        }
        notifications.push({
            tenantId: vacateData.tenantId,
            propertyPpid: vacateData.propertyId,
            audience: 'tenant',
            title: 'Stay Retained',
            message: 'Your stay has been retained by the owner and your vacate request is cancelled.',
            type: 'info',
            method: ['in-app'],
            meta: { vacateId: vacateData._id },
            createdBy: currentUser?.data?.user?.pgpalId || 'system'
        });
    }
    await sendNotifications(notifications);
}

// Generic notification sender


async function notifyVacateRemoved(vacateData, currentUser, property) {
    console.log('called notifyVacateRemoved',vacateData);
    const notifications = [];
    // Notify tenant
    notifications.push({
        tenantId: vacateData.tenantId,
        propertyPpid: vacateData.propertyId,
        audience: 'tenant',
        title: 'Removed by Owner',
        message: 'You have been removed from the property by the owner. Please contact the owner for details.',
        type: 'info',
        method: ['in-app', 'email'],
        meta: { vacateId: vacateData._id },
        createdBy: currentUser?.data?.user?.pgpalId || 'system'
    });
    // Notify owner (optional)
    if (property && property.ownerId) {
        notifications.push({
            ownerId: property.ownerId,
            propertyPpid: vacateData.propertyId,
            audience: 'owner',
            title: 'Tenant Removed',
            message: `You have removed tenant ${vacateData.name} from bed ${vacateData.bedId}.`,
            type: 'info',
            method: ['in-app'],
            meta: { vacateId: vacateData._id },
            createdBy: currentUser?.data?.user?.pgpalId || 'system'
        });
    }
    await sendNotifications(notifications);
}

async function sendNotifications(notifications) {
    for (const notification of notifications) {
        console.log('Queuing notification:', notification);
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
    notifyVacateRaised,
    notifyVacateApproved,
    notifyVacateRejected,
    notifyVacateWithdrawnOrRetained,
    sendNotifications,
    notifyVacateRemoved
};