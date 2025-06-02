const Room = require('../models/roomModel');
const axios = require('axios');
const mongoose = require('mongoose');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const { getOwnProperty } = require('./internalApis.js');

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
        const xUserHeader = req.headers['x-user'];
        if (!xUserHeader) return res.status(400).json({ error: 'Missing x-user header' });
        const currentUser = JSON.parse(xUserHeader);
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Only owners can bulk create rooms' });
        }

        const { propertyId, rooms } = req.body;
        if (!propertyId) return res.status(400).json({ error: 'Property ID is required' });
        if (!Array.isArray(rooms) || rooms.length === 0) {
            return res.status(400).json({ error: 'Rooms array is required' });
        }

        const property = await getOwnProperty(propertyId, currentUser, false);
        if (!property) return res.status(404).json({ error: 'Property not found' });
        if (property.ownerId.toString() !== id) {
            return res.status(403).json({ error: `Forbidden: You don't own this property` });
        }

        const roomTypeBedMap = {
            single: 1, double: 2, triple: 3, four: 4,
            five: 5, six: 6, seven: 7, eight: 8
        };

        // Validate duplicate room numbers on the same floor
        for (const room of rooms) {
            const { roomNumber, floor } = room;

            const existingRoom = await Room.findOne({
                propertyId,
                roomNumber,
                floor
            });

            if (existingRoom) {
                return res.status(400).json({
                    error: `Room number ${roomNumber} already exists on floor ${floor} for this property.`
                });
            }
        }

        const roomsToInsert = [];
        const tenantsToCreate = [];
        const bedTenantMap = {}; // Map bedId to roomNumber for later update

        for (const room of rooms) {
            const { roomNumber, floor, type, rentPerBed, beds } = room;
            const totalBeds = roomTypeBedMap[type];
            if (!totalBeds) return res.status(400).json({ error: `Invalid room type: ${type}` });
            if (!Array.isArray(beds) || beds.length !== totalBeds) {
                return res.status(400).json({ error: `Room ${roomNumber}: Expected ${totalBeds} beds` });
            }

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

        // First Transaction: Commit room creation
        session.startTransaction();
        const insertedRooms = await Room.insertMany(roomsToInsert, { session });
        await session.commitTransaction();
        session.endSession();

        // Second Transaction: Assign tenants
        const tenantSession = await mongoose.startSession();
        tenantSession.startTransaction();

        let tenantErrors = [];
        if (tenantsToCreate.length > 0) {
            try {
                const tenantResponse = await axios.post(
                    'http://tenant-service:4004/api/tenant-service/bulk-add',
                    { tenants: tenantsToCreate },
                    {
                        headers: {
                            'x-user': JSON.stringify(currentUser),
                            'x-internal-service': true
                        }
                    }
                );

                // Update bed statuses for successfully added tenants
                if (tenantResponse.data && Array.isArray(tenantResponse.data.results)) {
                    for (const result of tenantResponse.data.results) {
                        if (result.tenant && result.bedId) {
                            await Room.updateOne(
                                { propertyId, roomNumber: bedTenantMap[result.bedId], 'beds.bedId': result.bedId },
                                { $set: { 'beds.$.status': 'occupied' } },
                                { session: tenantSession }
                            );
                        } else if (result.error && result.bedId) {
                            tenantErrors.push({ bedId: result.bedId, error: result.error });
                        }
                    }
                }

                // Commit tenant assignment transaction
                await tenantSession.commitTransaction();
                tenantSession.endSession();
            } catch (err) {
                console.error('Tenant assignment failed. Rolling back tenant-related changes:', err.message);
                await tenantSession.abortTransaction();
                tenantSession.endSession();
                tenantErrors.push({ error: err.message });
            }
        }

        // Update property stats
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

        res.status(201).json({
            message: tenantErrors.length > 0
                ? 'Rooms created successfully, but some tenants could not be assigned. See tenantErrors.'
                : 'Rooms, beds, and tenants created successfully.',
            rooms: insertedRooms,
            tenantErrors: tenantErrors.length > 0 ? tenantErrors : undefined
        });

    } catch (err) {
        console.error('[bulkCreateRoomsAndBeds] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};