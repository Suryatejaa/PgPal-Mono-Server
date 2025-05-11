const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser, ppid) => {
    let url;
    if (ppid) {
        url = `http://property-service:4002/api/property-service/property-ppid/${propertyId}`;
    } else {
        url = `http://property-service:4002/api/property-service/property/${propertyId}`;
    }
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

const getTenantDocs = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/tenant-service/tenantDocs/${propertyId}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getTenants] Error:', error.message);
        return null;
    }
};

const getRoomDocs = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/room-service/roomDocs/${propertyId}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getRoomDocs] Error:', error.message);
        return null;
    }
};

const getBedDocs = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/room-service/bedDocs/${propertyId}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getBedDocs] Error:', error.message);
        return null;
    }
};

const getCheckins = async (propertyId, period, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/tenant-service/checkins/${propertyId}?period=${period}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getCheckins] Error:', error.message);
        return null;
    }
};

const getVacates = async (propertyId, period, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/tenant-service/vacates/${propertyId}?period=${period}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getVacates] Error:', error.message);
        return null;
    }
};

const getComplaintStats = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/complaint-service/metrics/summary/${propertyId}`, {  // Updated to use propertyId
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.error('[getComplaintStats] Error:', error.message);
        return null;
    }
};


module.exports = {
    getOwnProperty,
    getTenantConfirmation,
    getPropertyOwner,
    getTenantDocs,
    getRoomDocs,
    getBedDocs,
    getCheckins,
    getVacates,
    getComplaintStats,
};