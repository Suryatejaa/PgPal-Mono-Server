const axios = require('axios');

const getTenantConfirmation = async (tenantId, currentUser) => {
    try {
        const response = await axios.get(`http://tenant-service:4004/api/tenant-service/tenants?ppid=${tenantId}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getTenantConfirmation] Error:', error.message);
        return null;
    }
};

const getActiveTenantsForProperty = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://tenant-service:4004/api/tenant-service/active-tenants/${propertyId}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getActiveTenantsForProperty] Error:', error.message);
        return null;
    }
};

const sendNotification = async (currentUser, tenantId, title, message, type, method) => {

    try {
        const response = await axios.post('http://notification-service:4009/api/notification-service',
            {
                tenantId,
                title,
                message,
                type,
                method,
                createdBy: 'system'
            },
            {
                headers: {
                    'x-user': JSON.stringify(currentUser),
                    'x-internal-service': true
                }
            });
    } catch (err) {
        console.error('Error sending notification:', err.message);
    }
};

module.exports = {
    getTenantConfirmation,
    sendNotification,
    getActiveTenantsForProperty,
};