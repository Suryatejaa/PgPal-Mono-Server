const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser, ppid) => {
    let url;
    if (ppid) {
        url = `http://property-service:4002/api/property-service/property-ppid/${propertyId}`;
    } else {
        url = `http://property-service:4002/api/property-service/property/${propertyId}`;
    }
    console.log(url);
    try {
        const response = await axios.get(url, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });
        return response.data;
    } catch (error) {
        console.log(error.message);
        return null;
    }
};

const getUserByPhone = async (phone, currentUser) => {
    try {
        const response = await axios.get(`http://auth-service:4001/api/auth-service/user?phnum=${phone}`, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        }
        );
        return response.data;
    } catch (error) {
        console.error('[getUserByPhone] Error:', error.message);
        return null;
    }
};

const getRoomByNumber = async (propertyId, roomNumber, currentUser) => {
    try {
        const response = await axios.get(
            `http://room-service:4003/api/room-service/${propertyId}/rooms`,
            {
                headers: {
                    'x-user': JSON.stringify(currentUser),
                    'x-internal-service': true
                }
            }
        );
        const room = response.data.rooms.find(r => r.roomNumber == roomNumber);

        return room || null;
    } catch (error) {
        console.error('[getRoomByNumber] Error:', error.message);
        return null;
    }
};


const getUserByPpid = async (ppt, currentUser) => {
    try {
        const response = await axios.get(
            `http://auth-service:4001/api/auth-service/user?ppid=${ppt}`,
            {
                headers: {
                    'x-user': JSON.stringify(currentUser),
                    'x-internal-service': true
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('[getUserByPpid] Error:', error.message);
        return null;
    }
};


const assignBed = async (roomId, bedId, tenantPhone, rentPerBed, tenantPpt, currentUser) => {
    try {
        const response = await axios.patch(
            `http://room-service:4003/api/room-service/rooms/${roomId}/assign-bed`,
            { bedId, phone: tenantPhone, rentPerBed, tenantPpt },
            {
                headers: {
                    'x-user': JSON.stringify(currentUser),
                    'x-internal-service': true,
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('[assignBed] Error:', error.message || error.data);
        return null;
    }
};

const clearBed = async (roomId, bedId, currentUser) => {
    console.log('room and bed ', roomId, bedId);
    try {
        const response = await axios.patch(
            `http://room-service:4003/api/room-service/rooms/${roomId}/clear-bed`,
            { bedId },
            {
                headers: {
                    'x-user': JSON.stringify(currentUser),
                    'x-internal-service': true
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('[clearBed] Error:', error.message);
        return error;
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
    getOwnProperty,
    getUserByPhone,
    getRoomByNumber,
    getUserByPpid,
    assignBed,
    clearBed,
    sendNotification
};