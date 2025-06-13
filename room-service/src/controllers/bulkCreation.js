const Room = require('../models/roomModel');
const axios = require('axios');
const mongoose = require('mongoose');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const {makeInternalApiCall, getOwnProperty } = require('./internalApis.js');
const PlanLimits = require('../config/planLimits.js');

const retryTenantService = async (tenantPayload, currentUser, retries = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const tenantResponse = await axios.post(
                'http://tenant-service:4004/api/tenant-service/bulk-add',
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
            if (attempt === retries) throw err;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

exports.bulkCreateRoomsAndBeds = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        // ✅ 1. Authentication and validation
        const xUserHeader = req.headers['x-user'];
        if (!xUserHeader) return res.status(400).json({ error: 'Missing x-user header' });

        const currentUser = JSON.parse(xUserHeader);
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const currentPlan = currentUser.data.user.currentPlan || 'free';

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Only owners can bulk create rooms' });
        }

        const { propertyId, rooms } = req.body;

        if (!propertyId) return res.status(400).json({ error: 'Property ID is required' });
        if (!Array.isArray(rooms) || rooms.length === 0) {
            return res.status(400).json({ error: 'Rooms array is required' });
        }

        // ✅ 2. Property validation
        const property = await getOwnProperty(propertyId, currentUser, false);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) {
            return res.status(403).json({ error: `Forbidden: You don't own this property` });
        }

        // ✅ 3. Check plan limits - FIXED LOGIC
        const planLimits = PlanLimits[currentPlan] || PlanLimits.free;
        const maxRoomsAllowed = planLimits.maxRoomsPerProperty || -1;
        const maxBedsAllowed = planLimits.maxBedsPerProperty || -1;

        // Count existing rooms and beds
        const currentRoomCount = await Room.countDocuments({ propertyId });
        const currentBedCount = await Room.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            { $group: { _id: null, totalBeds: { $sum: "$totalBeds" } } }
        ]);
        const totalExistingBeds = currentBedCount[0]?.totalBeds || 0;

        // Calculate new beds being added
        const roomTypeBedMap = {
            single: 1, double: 2, triple: 3, four: 4,
            five: 5, six: 6, seven: 7, eight: 8
        };

        // Count new rooms and beds being added
        const newRoomsCount = rooms.length;
        const newBedsCount = rooms.reduce((sum, room) => {
            const bedsInRoom = roomTypeBedMap[room.type] || 0;
            if (!bedsInRoom) {
                throw new Error(`Invalid room type: ${room.type}`);
            }
            return sum + bedsInRoom;
        }, 0);

        // Check against limits
        if (maxRoomsAllowed !== -1 && (currentRoomCount + newRoomsCount) > maxRoomsAllowed) {
            return res.status(403).json({
                code: 'ROOM_LIMIT_EXCEEDED',
                error: `Cannot exceed the limit of ${maxRoomsAllowed} rooms per property`,
                currentRoomCount,
                roomsBeingAdded: newRoomsCount,
                totalAfterAddition: currentRoomCount + newRoomsCount,
                maxRoomsAllowed
            });
        }

        if (maxBedsAllowed !== -1 && (totalExistingBeds + newBedsCount) > maxBedsAllowed) {
            return res.status(403).json({
                code: 'BED_LIMIT_EXCEEDED',
                error: `Cannot exceed the limit of ${maxBedsAllowed} beds per property`,
                currentBedCount: totalExistingBeds,
                bedsBeingAdded: newBedsCount,
                totalAfterAddition: totalExistingBeds + newBedsCount,
                maxBedsAllowed
            });
        }

        // ✅ 4. Validate room types and room-bed counts
        for (const room of rooms) {
            const { type } = room;
            const expectedBeds = roomTypeBedMap[type];

            if (!expectedBeds) {
                return res.status(400).json({
                    error: `Invalid room type: ${type}`,
                    validTypes: Object.keys(roomTypeBedMap).join(', ')
                });
            }

            if (!Array.isArray(room.beds) || room.beds.length !== expectedBeds) {
                return res.status(400).json({
                    error: `Room ${room.roomNumber}: Expected ${expectedBeds} beds for room type '${type}'`,
                    expected: expectedBeds,
                    received: room.beds?.length || 0
                });
            }
        }

        // ✅ 5. Check for duplicate rooms
        const existingRooms = await Room.find({ propertyId });
        const existingRoomFloorMap = new Map();

        // Build a map of existing room+floor combinations
        for (const existingRoom of existingRooms) {
            const key = `${existingRoom.roomNumber}-${existingRoom.floor}`;
            existingRoomFloorMap.set(key, true);
        }

        // Check each new room for conflicts with existing rooms
        for (const room of rooms) {
            const { roomNumber, floor } = room;
            const key = `${roomNumber}-${floor}`;

            if (existingRoomFloorMap.has(key)) {
                return res.status(400).json({
                    error: `Room number ${roomNumber} already exists on floor ${floor} for this property`,
                    code: 'DUPLICATE_ROOM_ON_FLOOR'
                });
            }

            // Also check for duplicates within the new batch
            existingRoomFloorMap.set(key, true);
        }

        // ✅ 6. Prepare room and tenant data
        const roomsToInsert = [];
        const tenantsToCreate = [];
        const bedTenantMap = {}; // Map bedId to roomNumber for later update

        for (const room of rooms) {
            const { roomNumber, floor, type, rentPerBed, beds } = room;
            const totalBeds = roomTypeBedMap[type];

            const bedsWithIds = beds.map((bed, index) => {
                const bedId = `${roomNumber}-B${index + 1}`;
                if (bed.status === 'occupied' && bed.tenant) {
                    tenantsToCreate.push({
                        ...bed.tenant,
                        propertyId,
                        roomNumber,
                        bedId
                    });
                    bedTenantMap[bedId] = roomNumber;
                }
                return { ...bed, bedId, status: 'vacant' }; // Initially mark all beds as vacant
            });

            // Initially set all rooms to vacant; we'll update after tenant creation
            roomsToInsert.push({
                propertyId,
                roomNumber,
                rentPerBed,
                floor,
                type,
                totalBeds,
                beds: bedsWithIds,
                status: 'vacant',
                updatedBy: id,
                updatedByName: currentUser.data.user.username,
                updatedByRole: role
            });
        }

        // ✅ 7. Insert rooms in a transaction
        session.startTransaction();
        const insertedRooms = await Room.insertMany(roomsToInsert, { session });
        await session.commitTransaction();
        session.endSession();

        // ✅ 8. Process tenants if any
        let tenantErrors = [];
        if (tenantsToCreate.length > 0) {
            try {
                const tenantResult = await makeInternalApiCall(
                    'POST',
                    'http://tenant-service:4004/api/tenant-service/bulk-add',
                    { tenants: tenantsToCreate },
                    { 'x-user': JSON.stringify(currentUser) },
                    'bulkAddTenants',
                    'tenant-service',
                    'room-service'
                );

                if (tenantResult.success) {
                    // Update bed statuses for successfully added tenants
                    if (tenantResult.data && Array.isArray(tenantResult.data.results)) {
                        for (const result of tenantResult.data.results) {
                            if (result.tenant && result.bedId) {
                                await Room.updateOne(
                                    { propertyId, roomNumber: bedTenantMap[result.bedId], 'beds.bedId': result.bedId },
                                    { $set: { 'beds.$.status': 'occupied' } }
                                );
                            } else if (result.error && result.bedId) {
                                tenantErrors.push({ bedId: result.bedId, error: result.error });
                            }
                        }
                    }
                } else {
                    tenantErrors.push({ error: `Tenant service unavailable: ${tenantResult.error}` });
                }
            } catch (err) {
                tenantErrors.push({ error: err.message });
            }
        }

        // ✅ 9. Update room status based on bed occupancy
        try {
            const allRooms = await Room.find({
                propertyId,
                roomNumber: { $in: rooms.map(r => r.roomNumber) }
            });

            for (const room of allRooms) {
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
        } catch (statusUpdateError) {
            console.warn(`⚠️ Status update error: ${statusUpdateError.message}`);
            // Non-critical error, don't fail the whole operation
        }

        // ✅ 10. Update property statistics
        try {
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

            await makeInternalApiCall(
                'PATCH',
                `http://property-service:4002/api/property-service/properties/${propertyId}/update-beds`,
                {
                    totalBeds: updatedTotalBeds,
                    totalRooms: totalRoomsInProperty,
                    occupiedBeds: updatedOccupiedBeds,
                    availableBeds: updatedAvailableBeds
                },
                { 'x-user': JSON.stringify(currentUser) },
                'updatePropertyBedStats',
                'property-service',
                'room-service'
            );
        } catch (statsUpdateError) {
            console.warn(`⚠️ Stats update error: ${statsUpdateError.message}`);
            // Non-critical error, don't fail the whole operation
        }

        // ✅ 11. Clear cache and return response
        await invalidateCacheByPattern(`*${propertyId}*`);
        await invalidateCacheByPattern(`*${property.pgpalId}*`);

        const responseMessage = tenantErrors.length > 0
            ? 'Rooms created successfully, but some tenants could not be assigned'
            : 'Rooms, beds, and tenants created successfully';

        res.status(201).json({
            message: responseMessage,
            rooms: insertedRooms,
            tenantErrors: tenantErrors.length > 0 ? tenantErrors : undefined,
            stats: {
                roomsCreated: insertedRooms.length,
                bedsCreated: newBedsCount,
                tenantsProcessed: tenantsToCreate.length,
                tenantErrors: tenantErrors.length
            }
        });

    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();

        console.error('Error in bulk create:', err);
        res.status(500).json({
            error: 'Failed to create rooms and beds',
            details: err.message
        });
    }
};