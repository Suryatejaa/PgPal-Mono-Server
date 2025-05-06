const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser, ppid) => {
    let url;
    if (ppid) {
        url = `http://localhost:4000/api/property-service/property-ppid/${propertyId}`;
    } else {
        url = `http://localhost:4000/api/property-service/property/${propertyId}`;
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
        return {
            status: error.status,
            error: error.response.data.error
        };
    }
};

const getUserByPhone = async (phone, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/auth-service/user?phnum=${phone}`, {
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
            `http://localhost:4000/api/room-service/${propertyId}/rooms`,
            {
                headers: {
                    'x-user': JSON.stringify(currentUser),
                    'x-internal-service': true
                }
            }
        );
        console.log(response.data.rooms);
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
            `http://localhost:4000/api/auth-service/user?ppid=${ppt}`,
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
            `http://localhost:4000/api/room-service/rooms/${roomId}/assign-bed`,
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
        console.error('[assignBed] Error:', error);
        return null;
    }
};

const clearBed = async (roomId, bedId, currentUser) => {
    console.log('room and bed ', roomId, bedId);
    try {
        const response = await axios.patch(
            `http://localhost:4000/api/room-service/rooms/${roomId}/clear-bed`,
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
        const response = await axios.post('http://localhost:4000/api/notification-service',
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