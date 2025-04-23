const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser, ppid) => {
    let url;
    if (ppid) {
        url = `http://localhost:4000/api/property-service/property-ppid/${propertyId}`;
    } else {
        url = `http://localhost:4000/api/property-service/property/${propertyId}`;
    }
    console.log(url)
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

const getTenantConfirmation = async (tenantId, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/tenant-service/tenants?ppid=${tenantId}`, {
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
        const response = await axios.get(`http://localhost:4000/api/property-service/property-ppid/${propertyId}`, {
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

module.exports = {
    getOwnProperty,
    getTenantConfirmation,
    getPropertyOwner,
};