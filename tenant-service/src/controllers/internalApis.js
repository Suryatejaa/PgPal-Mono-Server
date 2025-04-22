const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/property-service/property/${propertyId}`, {
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

        const room = response.data.find(r => r.roomNumber == roomNumber);

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


const assignBed = async (roomId, bedId, tenantPhone, tenantPpt, currentUser) => {
    try {
        const response = await axios.patch(
            `http://localhost:4000/api/room-service/rooms/${roomId}/assign-bed`,
            { bedId, phone: tenantPhone, tenantPpt },
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
        return null;
    }
};

module.exports = {
    getOwnProperty,
    getUserByPhone,
    getRoomByNumber,
    getUserByPpid,
    assignBed,
    clearBed
};