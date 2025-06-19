const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser, ppid) => {
    let url;
    if (ppid) {
        url = `http://property-service:4002/property-ppid/${propertyId}`;
    } else {
        url = `http://property-service:4002/property/${propertyId}`;
    }
    //console.log(url)
    try {
        const response = await axios.get(url, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        return null;
    }
};

const getActiveTenantsForProperty = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://tenant-service:4004/active-tenants/${propertyId}`, {
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

const getTenantConfirmation = async (tenantId, currentUser) => {
    try {
        const response = await axios.get(`http://tenant-service:4004/tenants?ppid=${tenantId}`, {
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

const getPropertyOwner = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://property-service:4002/property-ppid/${propertyId}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getPropertyOwner] Error:', error.message);
        return null;
    }
};

const getAllProperties = async (currentUser) => {
    try {
        const response = await axios.get('http://property-service:4002/getAllProperties', {
            headers: {                
                'x-internal-service': true
            }
        });
        // console.log(response.data);
        return response.data;
    } catch (error) {
        console.error('[getAllProperties] Error:', error.message);
        return null;
    }
};

const sendNotification = async (currentUser, tenantId, title, message, type, method) => {

    try {
        const response = await axios.post('http://notification-service:4009',
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
    getOwnProperty,
    getTenantConfirmation,
    getPropertyOwner,
    sendNotification,
    getActiveTenantsForProperty,
    getAllProperties
};