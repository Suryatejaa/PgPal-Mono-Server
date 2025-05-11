const Room = require('../models/roomModel');
const axios = require('axios');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const { getOwnProperty } = require('./internalApis');


exports.assignBed = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) {
        return res.status(403).json({ error: 'Forbidden: Only internal service can assign beds' });
    }

    const roomId = req.params.roomId;
    const bedId = req.body.bedId;
    const tenantNo = req.body.phone;
    const tenantPpt = req.body.tenantPpt;
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;

    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }
    if (role !== 'owner' && !internalService) {
        return res.status(403).json({ error: 'Forbidden: Only owners can assign beds' });
    }
    if (!roomId || !bedId || !tenantNo) {
        return res.status(400).json({ error: 'Room ID, Bed ID, and Tenant No are required' });
    }
    try {
        console.log('roomid: ',roomId)
        const room = await Room.findOne({ pgpalId: roomId });
        console.log('room: ',room);
        const propertyId = room.propertyId;
        const property = await getOwnProperty(propertyId, currentUser, false);
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (property.ownerId.toString() !== id && !internalService) {
            return res.status(403).json({ error: `Forbidden: You didn't own this property` });
        }

        if (!room) return res.status(404).json({ error: 'Room not found' });

        console.log(room.rentPerBed);
        const bed = room.beds.find(b => b.bedId === bedId);
        if (!bed) return res.status(404).json({ error: 'Bed not found' });
        if (bed.status === 'occupied') {
            return res.status(400).json({ error: 'Bed is already occupied' });
        }


        bed.status = 'occupied';
        bed.tenantNo = tenantNo;
        bed.tenantPpt = tenantPpt;
        room.status = room.beds.every(b => b.status === 'occupied') ? 'occupied' : 'partially occupied';
        await room.save();
        console.log("Bed assigned successfully", room);

        res.status(200).json({ status: 200, message: 'Bed assigned successfully', room });
    }
    catch (error) {
        console.error('Error assigning bed:', error.message);
        res.status(400).json({ error: error.message });
    }
};

exports.clearBed = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) {
        return res.status(403).json({ error: 'Forbidden: Only internal service can clear beds' });
    }

    const roomId = req.params.roomId;
    const bedId = req.body.bedId;
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;
    console.log('clearBed called', roomId, bedId, id, role);
    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }
    if (!roomId || !bedId) {
        return res.status(400).json({ error: 'Room ID and Bed ID are required' });
    }
    try {
        const room = await Room.findOne({ pgpalId: roomId });

        if (!room) return res.status(404).json({ error: 'Room not found' });

        const bed = room.beds.find(b => b.bedId === bedId);
        console.log('Clearing bed:', bed);
        if (!bed) return res.status(404).json({ error: 'Bed not found' });
        if (bed.status === 'vacant') {
            return res.status(400).json({ error: 'Bed is already vacant' });
        }

        bed.status = 'vacant';
        bed.tenantNo = null;
        bed.tenantPpt = null;
        room.status = room.beds.every(b => b.status === 'vacant') ? 'vacant' : 'partially occupied';
        await room.save();
        console.log('Bed cleared successfully', room);

        res.status(200).json({ status: 200, message: 'Bed cleared successfully', room });
    }
    catch (error) {
        console.error('Error clearing bed:', error.message);
        res.status(400).json({ error: error.message });
    }
};
