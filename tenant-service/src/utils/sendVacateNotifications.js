const notificationQueue = require('../utils/notificationQueue');

const NotificationTypes = {
    VACATE_RAISED: 'vacate_raised',
    VACATE_WITHDRAWN: 'vacate_withdrawn',
    REMINDER: 'reminder',
    INFO: 'info'
};

async function sendVacateNotifications({
    vacateRequest,
    property,
    tenantId,
    currentUser,
    isWithdraw = false
}) {
    try {
        const notifications = [];

        // Owner notification
        if (property?.ownerId) {
            notifications.push(
                notificationQueue.add('notifications', {
                    ownerId: property.ownerId,
                    propertyPpid: property.pgpalId,
                    audience: 'owner',
                    title: isWithdraw ? "Vacate Request Withdrawn" : "Vacate Request Raised",
                    message: `Bed: ${vacateRequest.bedId} has ${isWithdraw ? 'withdrawn their' : 'raised a'} vacate request.`,
                    type: isWithdraw ? "info" : "reminder",
                    method: ["in-app", "email"],
                    meta: { vacateId: vacateRequest._id },
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 3000 }
                })
            );
        }

        // Tenant notification
        notifications.push(
            notificationQueue.add('notifications', {
                tenantId,
                propertyPpid: property.pgpalId,
                audience: 'tenant',
                title: isWithdraw ? 'Vacate Request Withdrawn' : 'Your Vacate Request Submitted',
                message: isWithdraw
                    ? 'You have successfully withdrawn your vacate request.'
                    : 'Your vacate request has been submitted successfully.',
                type: isWithdraw ? "info" : "reminder",
                method: ["in-app", "email"],
                meta: { vacateId: vacateRequest._id },
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 }
            })
        );

        await Promise.all(notifications);
        return true;
    } catch (error) {
        console.error('Failed to queue notifications:', error);
        return false;
    }
}

module.exports = {
    sendVacateNotifications,
    NotificationTypes
};