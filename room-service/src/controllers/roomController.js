const Room = require('../models/roomModel');
const axios = require('axios');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const { getOwnProperty } = require('./internalApis.js');
const mongoose = require('mongoose');

const retryTenantService = async (tenantPayload, currentUser, retries = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const tenantResponse = await axios.post(
                'http://tenant-service:4004/api/tenant-service',
                tenantPayload,
                {
                    headers: {
                        'x-user': JSON.stringify(currentUser),
                        'x-internal-service': true
                    }
                }
            );
            return tenantResponse;
        } catch (err) {
            if (attempt === retries) {
                throw err; // Throw error after exhausting retries
            }
            console.warn(`Retrying tenant-service call for bed ${tenantPayload.bedId} (Attempt ${attempt})`);
            await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retrying
        }
    }
};

exports.addRooms = async (req, res) => {
    try {
        if (!req.headers['x-user']) {
            return res.status(400).json({ error: 'Missing x-user header' });
        }

        const currentUser = JSON.parse(req.headers['x-user']);
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const ppid = currentUser.data.user.pgpalId;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Only owners can add rooms' });
        }

        const { propertyId, rooms } = req.body;

        if (!propertyId) return res.status(400).json({ error: 'Property ID is required' });
        if (!Array.isArray(rooms) || rooms.length === 0) {
            return res.status(400).json({ error: 'Rooms array is required' });
        }

        const property = await getOwnProperty(propertyId, currentUser, false);
        const propertyPpid = property.pgpalId;
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) {
            return res.status(403).json({ error: `Forbidden: You don't own this property` });
        }

        const roomTypeBedMap = {
            single: 1, double: 2, triple: 3, four: 4,
            five: 5, six: 6, seven: 7, eight: 8
        };

        const roomsToInsert = [];
        const bedsToUpdate = [];
        const tenantErrors = [];

        const existingRooms = await Room.find({ propertyId });
        const existingRoomNumbers = existingRooms.map(room => room.roomNumber);

        for (const room of rooms) {
            if (existingRoomNumbers.includes(Number(room.roomNumber))) {
                return res.status(400).json({ error: `Room number ${room.roomNumber} already exists for this property` });
            }
        }

        for (const room of rooms) {
            const { roomNumber, floor, type, rentPerBed, beds } = room;
            const totalBeds = roomTypeBedMap[type];
            if (!totalBeds) return res.status(400).json({ error: `Invalid room type: ${type}` });
            if (!Array.isArray(beds) || beds.length !== totalBeds) {
                return res.status(400).json({ error: `Room ${roomNumber}: Expected ${totalBeds} beds` });
            }

            const bedsWithIds = beds.map((bed, index) => {
                const bedId = `${roomNumber}-B${index + 1}`;
                if (bed.status === 'occupied') {
                    bedsToUpdate.push({ roomNumber, bedId, tenant: bed.tenant });
                }
                return { ...bed, bedId, status: 'vacant' };
            });

            const status = beds.every(b => b.status === 'vacant') ? 'vacant'
                : beds.every(b => b.status === 'occupied') ? 'occupied'
                    : 'partially occupied';

            roomsToInsert.push({
                propertyId,
                roomNumber,
                rentPerBed,
                floor,
                type,
                totalBeds,
                beds: bedsWithIds,
                status,
                updatedBy: id,
                updatedByName: currentUser.data.user.username,
                updatedByRole: role
            });
        }

        const insertedRooms = await Room.insertMany(roomsToInsert);

        const savedRooms = await Room.find({ propertyId, roomNumber: { $in: rooms.map(r => r.roomNumber) } });
        if (savedRooms.length !== rooms.length) {
            return res.status(500).json({ error: 'Failed to save all rooms. Please try again.' });
        }

        const totalRoomsInProperty = await Room.countDocuments({ propertyId });
        const totalBedsInProperty = await Room.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            { $group: { _id: null, totalBeds: { $sum: "$totalBeds" } } }
        ]);
        const occupiedBedsInProperty = await Room.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            { $unwind: "$beds" },
            { $match: { "beds.status": "occupied" } },
            { $count: "occupiedBeds" }
        ]);

        const updatedTotalBeds = totalBedsInProperty[0]?.totalBeds || 0;
        const updatedOccupiedBeds = occupiedBedsInProperty[0]?.occupiedBeds || 0;
        const updatedAvailableBeds = updatedTotalBeds - updatedOccupiedBeds;


        await axios.patch(`http://property-service:4002/api/property-service/properties/${propertyId}/update-beds`, {
            totalBeds: updatedTotalBeds,
            totalRooms: totalRoomsInProperty,
            occupiedBeds: updatedOccupiedBeds,
            availableBeds: updatedAvailableBeds
        }, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });

        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${propertyPpid}*`);


        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

        for (const bedToUpdate of bedsToUpdate) {
            const { roomNumber, bedId, tenant } = bedToUpdate;

            if (!tenant || !tenant.name || !tenant.phone || !tenant.aadhar || tenant.deposit === undefined || tenant.noticePeriodInMonths === undefined) {
                console.warn(`Missing tenant info for bed ${bedId}, skipping`);
                continue;
            }

            const tenantPayload = {
                name: tenant.name,
                phone: tenant.phone,
                aadhar: tenant.aadhar,
                propertyId,
                roomNumber,
                bedId,
                rentPaid: tenant.rentPaid,
                rentPaidMethod: tenant.rentPaidMethod,
                deposit: tenant.deposit,
                noticePeriodInMonths: tenant.noticePeriodInMonths || 1
            };

            console.log(tenantPayload);

            try {
                const tenantResponse = await retryTenantService(tenantPayload, currentUser);
                if (tenantResponse.status === 201) {
                    await Room.updateOne(
                        { propertyId, roomNumber, 'beds.bedId': bedId },
                        { $set: { 'beds.$.status': 'occupied' } }
                    );
                }
            } catch (err) {
                console.error(`Failed to add tenant for bed ${bedId}:`, err.message);
                tenantErrors.push({ bedId, error: err.response?.data?.error || err.message });
            }
        }

        // Recalculate room status
        const updatedRooms = await Room.find({ propertyId, roomNumber: { $in: rooms.map(r => r.roomNumber) } });
        for (const room of updatedRooms) {
            const updatedStatus = room.beds.every(b => b.status === 'vacant') ? 'vacant'
                : room.beds.every(b => b.status === 'occupied') ? 'occupied'
                    : 'partially occupied';

            await Room.updateOne(
                { _id: room._id },
                { $set: { status: updatedStatus } }
            );
        }

        const title = 'New Room Added';
        const message = 'A new room has been successfully added to the property.';
        const typee = 'info';
        const method = ['in-app'];

        try {
            console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantIds: [ppid],
                propertyPpid: propertyPpid,
                title,
                message,
                type: typee,
                method,
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${propertyPpid}*`);


        res.status(201).json({
            message: tenantErrors.length > 0 ? 'Rooms added successfully, but adding tenant failed, please add tenants separetly' : 'Rooms added successfully',
            rooms: insertedRooms,
            tenantErrors: tenantErrors.length > 0 ? tenantErrors : undefined
        });

    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};


exports.updateRoom = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;
    const ppid = currentUser.data.user.pgpalId;

    console.log(req.originalUrl)

    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    if (role !== 'owner') {
        return res.status(403).json({ error: 'Forbidden: Only owners can update rooms' });
    }

    if (!req.params.roomId) {
        return res.status(400).json({ error: 'Room ID is required' });
    }

    try {
        const { roomNumber, floor, rentPerBed } = req.body;

        const room = await Room.findById(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const propertyId = room.propertyId;
        const property = await getOwnProperty(propertyId, currentUser, false);
        const propertyPpid = property.pgpalId;
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (property.ownerId.toString() !== id) {
            return res.status(403).json({ error: `Forbidden: You don't own this property` });
        }



        if (req.query.add || req.query.remove) {
            try {
                await updateBedsLogic(room, req.query);
            } catch (err) {
                return res.status(400).json({ error: err.message });
            }
        }
        // Before updating, check for duplicate room number on the same floor

        const duplicateRoom = await Room.findOne({
            propertyId,
            floor,
            roomNumber,
            _id: { $ne: req.params.roomId }
        });
        if (duplicateRoom) {
            return res.status(400).json({ error: `Room number ${roomNumber} already exists on floor ${floor}` });
        }

        const oldRoomNumber = room.roomNumber;
        const isRoomNumberChanged = roomNumber && roomNumber !== oldRoomNumber;

        if (isRoomNumberChanged) {
            room.beds = room.beds.map((bed, idx) => {
                const match = bed.bedId.match(/-B(\d+)$/);
                const bedNum = match ? match[1] : (idx + 1);
                return {
                    ...bed,
                    bedId: `${roomNumber}-B${bedNum}`
                };
            });
        }

        // Update other fields directly on the room object
        room.roomNumber = roomNumber;
        room.floor = floor;
        room.rentPerBed = rentPerBed;
        room.updatedBy = id;
        room.updatedByName = currentUser.data.user.username;
        room.updatedByRole = currentUser.data.user.role;

        await room.save();

        res.status(200).json({
            message: 'Room updated successfully',
            updatedRoom: room
        });

        const title = 'Room Details Updated';
        const message = 'Room information has been updated. Please verify the latest changes.';
        const typee = 'alert';
        const method = ['in-app', 'email'];

        try {
            console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantIds: [ppid],
                propertyPpid: propertyPpid,
                title,
                message,
                type: typee,
                method,
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${propertyPpid}*`);

    } catch (error) {
        console.error('[updateRoom] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

async function updateBedsLogic(room, { add, remove }) {

    // Remove bed
    if (remove) {
        const removeList = Array.isArray(remove) ? remove : [remove];
        for (const removeId of removeList) {
            const bedToRemove = room.beds.find(bed => bed.bedId === removeId);
            if (!bedToRemove) {
                throw new Error(`Bed with ID ${removeId} not found`);
            }
            if (bedToRemove.status === 'occupied') {
                throw new Error(`Cannot remove occupied bed: ${removeId}`);
            }
            room.beds = room.beds.filter(bed => bed.bedId !== removeId);
        }
        room.totalBeds = room.beds.length;
    }

    let existingBeds = room.beds;
    // Add beds
    if (add) {
        const addCount = parseInt(add, 10);
        if (isNaN(addCount) || addCount <= 0) {
            throw new Error('Invalid add count');
        }
        if (existingBeds.length + addCount > 8) {
            throw new Error('Cannot add more than 8 beds in a room');
        }
        const highestBedNumber = existingBeds.reduce((max, bed) => {
            const match = bed.bedId.match(/-B(\d+)$/);
            const bedNumber = match ? parseInt(match[1], 10) : 0;
            return Math.max(max, bedNumber);
        }, 0);

        // Find all used numbers
        const usedNumbers = existingBeds.map(bed => {
            const match = bed.bedId.match(/-B(\d+)$/);
            return match ? parseInt(match[1], 10) : null;
        }).filter(n => n !== null);

        // Find the lowest available numbers up to 8
        const availableNumbers = [];
        for (let i = 1; i <= 8; i++) {
            if (!usedNumbers.includes(i)) availableNumbers.push(i);
        }

        // Add beds using available numbers
        for (let i = 0; i < addCount; i++) {
            const bedNum = availableNumbers[i];
            if (bedNum === undefined) break; // Shouldn't happen due to earlier check
            const newBedId = `${room.roomNumber}-B${bedNum}`;
            existingBeds.push({
                bedId: newBedId,
                status: 'vacant',
                tenantNo: null,
                tenantPpt: null
            });
        }
        room.totalBeds = existingBeds.length;
        room.beds = existingBeds;
    }

    // Update room type
    const bedCountToTypeMap = {
        1: 'single', 2: 'double', 3: 'triple', 4: 'four',
        5: 'five', 6: 'six', 7: 'seven', 8: 'eight'
    };
    room.type = bedCountToTypeMap[room.totalBeds] || room.type;

    await room.save();
    return room;
}

exports.updateBeds = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;

    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    if (role !== 'owner') {
        return res.status(403).json({ error: 'Forbidden: Only owners can update beds' });
    }

    if (!req.params.roomId) {
        return res.status(400).json({ error: 'Room ID is required' });
    }

    try {
        const { add, remove } = req.query;

        const room = await Room.findById(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const propertyId = room.propertyId;
        const property = await getOwnProperty(propertyId, currentUser, false);
        const propertyPpid = property.pgpalId;
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (property.ownerId.toString() !== id) {
            return res.status(403).json({ error: `Forbidden: You don't own this property` });
        }

        const existingBeds = room.beds;

        // Handle adding beds
        if (add) {
            const addCount = parseInt(add, 10);
            if (isNaN(addCount) || addCount <= 0) {
                return res.status(400).json({ error: 'Invalid add count' });
            }

            const currentBedCount = existingBeds.length;
            if (currentBedCount + addCount > 8) {
                return res.status(400).json({ error: 'Cannot add more than 8 beds in a room' });
            }

            const newBeds = [];

            // Find the highest existing bed number
            const highestBedNumber = existingBeds.reduce((max, bed) => {
                const match = bed.bedId.match(/-B(\d+)$/);
                const bedNumber = match ? parseInt(match[1], 10) : 0;
                return Math.max(max, bedNumber);
            }, 0);

            const usedNumbers = existingBeds.map(bed => {
                const match = bed.bedId.match(/-B(\d+)$/);
                return match ? parseInt(match[1], 10) : null;
            }).filter(n => n !== null);

            // Find the lowest available numbers up to 8
            const availableNumbers = [];
            for (let i = 1; i <= 8; i++) {
                if (!usedNumbers.includes(i)) availableNumbers.push(i);
            }

            // Add beds using available numbers
            for (let i = 0; i < addCount; i++) {
                const bedNum = availableNumbers[i];
                if (bedNum === undefined) break; // Shouldn't happen due to earlier check
                const newBedId = `${room.roomNumber}-B${bedNum}`;
                existingBeds.push({
                    bedId: newBedId,
                    status: 'vacant',
                    tenantNo: null,
                    tenantPpt: null
                });
            }

            room.beds = [...existingBeds, ...newBeds];
            room.totalBeds = room.beds.length;
        }

        // Handle removing a bed
        if (remove) {
            const bedToRemove = existingBeds.find(bed => bed.bedId === remove);
            if (!bedToRemove) {
                return res.status(404).json({ error: `Bed with ID ${remove} not found` });
            }

            if (bedToRemove.status === 'occupied') {
                return res.status(400).json({ error: `Cannot remove occupied bed: ${remove}` });
            }

            room.beds = existingBeds.filter(bed => bed.bedId !== remove);
            room.totalBeds = room.beds.length;
        }

        // Update room type based on total bed count
        const bedCountToTypeMap = {
            1: 'single',
            2: 'double',
            3: 'triple',
            4: 'four',
            5: 'five',
            6: 'six',
            7: 'seven',
            8: 'eight'
        };

        room.type = bedCountToTypeMap[room.totalBeds] || room.type;

        await room.save();

        // Update total bed count in property-service
        const totalBedsInProperty = await Room.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            { $group: { _id: null, totalBeds: { $sum: "$totalBeds" } } }
        ]);

        const updatedTotalBeds = totalBedsInProperty[0]?.totalBeds || 0;

        await axios.patch(`http://property-service:4002/api/property-service/properties/${propertyId}/update-beds`, {
            totalBeds: updatedTotalBeds
        }, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });

        const title = 'Room Details Updated';
        const message = 'Room information has been updated. Please verify the latest changes.';
        const typee = 'alert';
        const method = ['in-app', 'email'];

        try {
            console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantIds: [ppid],
                propertyPpid: propertyPpid,
                title,
                message,
                type: typee,
                method,
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${propertyPpid}*`);

        res.status(200).json({
            message: 'Beds updated successfully',
            updatedBeds: room.beds,
            updatedRoomType: room.type
        });

    } catch (error) {
        console.error('[updateBeds] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.deleteRoom = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;
    const ppid = currentUser.data.user.pgpalId;

    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }
    if (role !== 'owner') {
        return res.status(403).json({ error: 'Forbidden: Only owners can delete rooms' });
    }
    if (!req.params.roomId) {
        return res.status(400).json({ error: 'Room ID is required' });
    }

    try {
        const room = await Room.findById(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const propertyId = room.propertyId;
        const property = await getOwnProperty(propertyId, currentUser, false);

        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (property.ownerId.toString() !== id) {
            return res.status(403).json({ error: `Forbidden: You don't own this property` });
        }

        // Check if the room has any occupied beds
        const occupiedBeds = room.beds.filter(bed => bed.status === 'occupied');
        if (occupiedBeds.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete room with occupied beds. Please reassign or remove tenants first.',
                occupiedBeds: occupiedBeds.map(bed => bed.bedId)
            });
        }

        // Proceed with room deletion
        await Room.findByIdAndDelete(req.params.roomId);

        const totalRoomsInProperty = await Room.countDocuments({ propertyId });
        const totalBedsInProperty = await Room.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            { $group: { _id: null, totalBeds: { $sum: "$totalBeds" } } }
        ]);
        const occupiedBedsInProperty = await Room.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            { $unwind: "$beds" },
            { $match: { "beds.status": "occupied" } },
            { $count: "occupiedBeds" }
        ]);

        const updatedTotalBeds = totalBedsInProperty[0]?.totalBeds || 0;
        const updatedOccupiedBeds = occupiedBedsInProperty[0]?.occupiedBeds || 0;
        const updatedAvailableBeds = updatedTotalBeds - updatedOccupiedBeds;

        await axios.patch(`http://property-service:4002/api/property-service/properties/${propertyId}/update-beds`, {
            totalBeds: updatedTotalBeds,
            totalRooms: totalRoomsInProperty,
            occupiedBeds: updatedOccupiedBeds,
            availableBeds: updatedAvailableBeds
        }, {
            headers: {
                'x-user': JSON.stringify(currentUser),
                'x-internal-service': true
            }
        });

        const propertyPpid = property.pgpalId;

        const title = 'Room Deleted';
        const message = 'A room has been removed from the property listing.';
        const type = 'alert';
        const method = ['in-app', 'email'];

        try {
            console.log('Adding notification job to the queue...');

            await notificationQueue.add('notifications', {
                tenantIds: [ppid],
                propertyPpid: propertyPpid,
                title,
                message,
                type,
                method,
                createdBy: currentUser?.data?.user?.pgpalId || 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${propertyId}*`);


        res.status(200).json({ message: 'Room deleted successfully' });
    } catch (error) {
        console.error('[deleteRoom] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

