const Room = require('../models/roomModel');
const axios = require('axios');
const CacheHelper = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const { getOwnProperty } = require('./internalApis.js');
const mongoose = require('mongoose');
const { getActiveTenantsForProperty } = require('./internalApis.js');
const PlanLimits = require('../config/planLimits.js');

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

/**
 * Add one or more rooms to a property, with optional tenant data
 */
exports.addRooms = async (req, res) => {
    try {
        // ✅ 1. User authentication and authorization
        if (!req.headers['x-user']) {
            return res.status(400).json({ error: 'Missing x-user header' });
        }

        const currentUser = JSON.parse(req.headers['x-user']) || {};
        if (!currentUser?.data?.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { _id: userId, role, username } = currentUser.data.user;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Only owners can add rooms' });
        }

        // ✅ 2. Request validation
        const { propertyId, rooms } = req.body;

        if (!propertyId) {
            return res.status(400).json({ error: 'Property ID is required' });
        }

        if (!Array.isArray(rooms) || rooms.length === 0) {
            return res.status(400).json({ error: 'Rooms array is required' });
        }

        // ✅ 3. Property validation
        const property = await getOwnProperty(propertyId, currentUser, false);
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (property.ownerId.toString() !== userId) {
            return res.status(403).json({ error: `Forbidden: You don't own this property` });
        }
        const propertyPpid = property.pgpalId;

        // ✅ 4. Plan limits check
        const currentPlan = currentUser.data.user.currentPlan || 'free';
        const planLimits = PlanLimits[currentPlan] || PlanLimits.free;
        const maxRoomsAllowed = planLimits.maxRoomsPerProperty || -1;
        const maxBedsAllowed = planLimits.maxBedsPerProperty || -1;

        // Check room limit
        const currentRoomCount = await Room.countDocuments({ propertyId });
        if (maxRoomsAllowed !== -1 && currentRoomCount + rooms.length > maxRoomsAllowed) {
            return res.status(403).json({
                code: 'ROOM_LIMIT_EXCEEDED',
                error: `Cannot add more than ${maxRoomsAllowed} rooms to this property`,
                currentRoomCount,
                maxRoomsAllowed
            });
        }

        // Check bed limit
        const currentBedCount = await Room.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            { $group: { _id: null, totalBeds: { $sum: "$totalBeds" } } }
        ]);
        const totalBeds = currentBedCount[0]?.totalBeds || 0;

        // Calculate total new beds being added
        const roomTypeBedMap = {
            single: 1, double: 2, triple: 3, four: 4,
            five: 5, six: 6, seven: 7, eight: 8
        };

        const bedsBeingAdded = rooms.reduce((sum, room) => {
            const bedsInRoom = roomTypeBedMap[room.type] || 0;
            if (bedsInRoom === 0) {
                throw new Error(`Invalid room type: ${room.type}`);
            }
            return sum + bedsInRoom;
        }, 0);

        if (maxBedsAllowed !== -1 && totalBeds + bedsBeingAdded > maxBedsAllowed) {
            return res.status(403).json({
                code: 'BED_LIMIT_EXCEEDED',
                error: `Cannot add more than ${maxBedsAllowed} beds to this property`,
                currentBedCount: totalBeds,
                maxBedsAllowed
            });
        }

        // ✅ 5. Check for duplicate rooms on same floor
        const existingRooms = await Room.find({ propertyId });
        const existingRoomFloorMap = new Map();

        // Build a map of existing room+floor combinations
        for (const existingRoom of existingRooms) {
            const key = `${existingRoom.roomNumber}-${existingRoom.floor}`;
            existingRoomFloorMap.set(key, true);
        }

        // Check each new room for conflicts on the same floor
        for (const room of rooms) {
            const key = `${room.roomNumber}-${room.floor}`;
            if (existingRoomFloorMap.has(key)) {
                return res.status(400).json({
                    error: `Room number ${room.roomNumber} already exists on floor ${room.floor}`,
                    code: 'DUPLICATE_ROOM_ON_FLOOR'
                });
            }
            // Mark this combination as used for subsequent rooms in the same batch
            existingRoomFloorMap.set(key, true);
        }

        // ✅ 6. Process each room and prepare for database
        const roomsToInsert = [];
        const bedsToUpdate = []; // For tenant tracking

        for (const room of rooms) {
            const { roomNumber, floor, type, rentPerBed, beds } = room;
            const totalBeds = roomTypeBedMap[type];

            // Validate bed count matches room type
            if (!Array.isArray(beds) || beds.length !== totalBeds) {
                return res.status(400).json({
                    error: `Room ${roomNumber}: Expected ${totalBeds} beds for room type '${type}'`,
                    expected: totalBeds,
                    received: beds?.length || 0
                });
            }

            // Process bed information
            const bedsWithIds = beds.map((bed, index) => {
                const bedId = `${roomNumber}-B${index + 1}`;

                // Track beds with tenants for later processing
                if (bed.status === 'occupied' && bed.tenant) {
                    bedsToUpdate.push({ roomNumber, bedId, tenant: bed.tenant });
                }

                // Default all beds to vacant initially
                return { ...bed, bedId, status: 'vacant' };
            });

            // Determine initial room status
            const status = 'vacant'; // Start with vacant, update after tenant processing

            // Add to insertion batch
            roomsToInsert.push({
                propertyId,
                roomNumber,
                rentPerBed,
                floor,
                type,
                totalBeds,
                beds: bedsWithIds,
                status,
                updatedBy: userId,
                updatedByName: username,
                updatedByRole: role
            });
        }

        // ✅ 7. Insert rooms into database
        const insertedRooms = await Room.insertMany(roomsToInsert);

        // ✅ 8. Update property statistics
        const updatedStats = await updatePropertyBedStats(propertyId);

        await axios.patch(
            `http://property-service:4002/api/property-service/properties/${propertyId}/update-beds`,
            updatedStats,
            {
                headers: {
                    'x-user': JSON.stringify(currentUser),
                    'x-internal-service': true
                }
            }
        );

        // ✅ 9. Clear cache
        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);

        // ✅ 10. Process tenant assignments if any
        const tenantErrors = [];

        if (bedsToUpdate.length > 0) {
            // Short delay to ensure rooms are available before tenant assignment
            await new Promise(resolve => setTimeout(resolve, 500));

            for (const { roomNumber, bedId, tenant } of bedsToUpdate) {
                if (!tenant?.name || !tenant.phone || !tenant.aadhar) {
                    console.warn(`Missing required tenant info for bed ${bedId}, skipping`);
                    tenantErrors.push({
                        bedId,
                        error: 'Missing required tenant information'
                    });
                    continue;
                }

                const tenantPayload = {
                    name: tenant.name,
                    phone: tenant.phone,
                    aadhar: tenant.aadhar,
                    propertyId,
                    roomNumber,
                    bedId,
                    rentPaid: tenant.rentPaid || 0,
                    rentPaidMethod: tenant.rentPaidMethod || null,
                    deposit: tenant.deposit || 0,
                    noticePeriodInMonths: tenant.noticePeriodInMonths || 1
                };

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
                    tenantErrors.push({
                        bedId,
                        error: err.response?.data?.error || err.message
                    });
                }
            }

            // Update room statuses after tenant assignments
            await updateRoomStatusesForProperty(propertyId);
        }

        // ✅ 11. Return success response
        res.status(201).json({
            message: tenantErrors.length > 0
                ? 'Rooms added successfully, but adding some tenants failed'
                : 'Rooms added successfully',
            rooms: insertedRooms,
            tenantErrors: tenantErrors.length > 0 ? tenantErrors : undefined
        });

    } catch (err) {
        console.error('Error adding rooms:', err);
        res.status(500).json({
            error: 'Failed to add rooms',
            details: err.message
        });
    }
};

/**
 * Helper function to update property bed statistics
 */
const updatePropertyBedStats = async (propertyId) => {
    const totalRooms = await Room.countDocuments({ propertyId });

    const totalBedsResult = await Room.aggregate([
        { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
        { $group: { _id: null, totalBeds: { $sum: "$totalBeds" } } }
    ]);

    const occupiedBedsResult = await Room.aggregate([
        { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
        { $unwind: "$beds" },
        { $match: { "beds.status": "occupied" } },
        { $count: "occupiedBeds" }
    ]);

    const totalBeds = totalBedsResult[0]?.totalBeds || 0;
    const occupiedBeds = occupiedBedsResult[0]?.occupiedBeds || 0;
    const availableBeds = totalBeds - occupiedBeds;

    return {
        totalRooms,
        totalBeds,
        occupiedBeds,
        availableBeds
    };
};

/**
 * Helper function to update room statuses
 */
const updateRoomStatusesForProperty = async (propertyId) => {
    const rooms = await Room.find({ propertyId });

    for (const room of rooms) {
        const updatedStatus = room.beds.every(b => b.status === 'vacant') ? 'vacant'
            : room.beds.every(b => b.status === 'occupied') ? 'occupied'
                : 'partially occupied';

        if (updatedStatus !== room.status) {
            await Room.updateOne(
                { _id: room._id },
                { $set: { status: updatedStatus } }
            );
        }
    }
};


exports.updateRoom = async (req, res) => {
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;
    const ppid = currentUser.data.user.pgpalId;

    //console.log(req.originalUrl);

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

        const occupiedBeds = room.beds.filter(bed => bed.status === 'occupied' && bed.tenantPpt);

        const title = 'Room Details Updated';
        const message = `Room ${room.roomNumber} information has been updated. Please verify the latest changes.`;
        const typee = 'alert';
        const method = ['in-app', 'email'];

        try {
            //console.log('Adding notification job to the queue...');

            for (const bed of occupiedBeds) {
                await notificationQueue.add('notifications', {
                    tenantId: bed.tenantPpt,
                    propertyPpid: propertyPpid,
                    audience: 'tenant',
                    title,
                    message,
                    type: typee,
                    method,
                    meta: { roomId: room._id, bedId: bed.bedId },
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });
            }

            //console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);

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
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
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
        const message = `Room ${room.roomNumber} information has been updated. Please verify the latest changes.`;
        const typee = 'alert';
        const method = ['in-app', 'email'];

        try {
            // Notify only tenants currently staying in this room
            const occupiedBeds = room.beds.filter(bed => bed.status === 'occupied' && bed.tenantPpt);
            for (const bed of occupiedBeds) {
                await notificationQueue.add('notifications', {
                    tenantId: bed.tenantPpt,
                    propertyPpid: propertyPpid,
                    audience: 'tenant',
                    title,
                    message,
                    type: typee,
                    method,
                    meta: { roomId: room._id, bedId: bed.bedId },
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });
            }
        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);

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

// PATCH /api/room-service/rooms/:roomId/beds/:bedObjectId/status
exports.changeBedStatus = async (req, res) => {
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const internalService = req.headers['x-internal-service'];
    if (!internalService) {
        return res.status(403).json({ error: 'Forbidden: Only internal service can change bed status' });
    }

    const { roomId, bedId } = req.params;
    const { status } = req.body;

    if (!['vacant', 'occupied', 'noticeperiod'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }

    try {
        const room = await Room.findOne({ pgpalId: roomId });
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const bed = room.beds.find(b => b.bedId === bedId);
        if (!bed) return res.status(404).json({ error: 'Bed not found' });

        await Room.updateOne(
            { pgpalId: roomId, 'beds.bedId': bedId },
            { $set: { 'beds.$.status': status } }
        );

        res.status(200).json({ message: 'Bed status updated', bed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteRoom = async (req, res) => {
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
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
        const message = `Room ${room.roomNumber} has been removed from the property listing.`;
        const type = 'alert';
        const method = ['in-app', 'email'];

        try {
            // Notify only tenants currently staying in this room
            const occupiedBeds = room.beds.filter(bed => bed.status === 'occupied' && bed.tenantPpt);
            for (const bed of occupiedBeds) {
                await notificationQueue.add('notifications', {
                    tenantId: bed.tenantPpt,
                    propertyPpid: propertyPpid,
                    audience: 'tenant',
                    title,
                    message,
                    type: typee,
                    method,
                    meta: { roomId: room._id, bedId: bed.bedId },
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });
            }
        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${property._id}*`);
        await invalidateCacheByPattern(`*${propertyId}*`);


        res.status(200).json({ message: 'Room deleted successfully' });
    } catch (error) {
        console.error('[deleteRoom] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.emptyAllRooms = async (req, res) => {
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const role = currentUser.data.user.role;
    if (role !== 'admin') {
        return res.status(403).json({ error: 'Only admin can empty all rooms' });
    }
    if (!req.params.id) {
        return res.status(400).json({ error: 'Property ID is required' });
    }
    const propertyId = req.params.id;
    try {
        const rooms = await Room.find({ propertyId });
        for (const room of rooms) {
            room.beds = room.beds.map(bed => ({
                ...bed,
                status: 'vacant',
                tenantNo: null,
                tenantPpt: null
            }));
            room.status = 'vacant';
            await room.save();
        }

        invalidateCacheByPattern(`*${propertyId}*`);
        invalidateCacheByPattern(`*${currentUser.data.user.pgpalId}*`);
        invalidateCacheByPattern(`*${propertyId}*`);

        res.status(200).json({ message: 'All rooms have been emptied (all beds set to vacant).' });
    } catch (error) {
        console.error('[emptyAllRooms] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

