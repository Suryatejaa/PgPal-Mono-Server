const { default: mongoose } = require('mongoose');
const Room = require('../models/roomModel');
const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser) => {

    try {
        const response = await axios.get(`http://localhost:4000/api/property-service/property?id=${propertyId}`,
            {
                headers: {
                    'x-internal-service': true,
                    'x-user': JSON.stringify(currentUser),
                }
            }
        );
        console.log(response.data);
        return response.data;
    } catch (error) {
        console.error('[getOwnProperty] Error:', error.response?.data || error.message);
        return null;
    }
};

exports.getRoomsByPropertyId = async (req, res) => {
    try {
        const propertyId = req.params.id;
        const rooms = await Room.find({ propertyId }).populate('propertyId', 'name location totalRooms ownerId');
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ error: 'No rooms found' });
        }
        res.status(200).json({
            totalRooms: rooms.length,
            rooms: rooms,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getRoomById = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    console.log(currentUser.data.user.pgpalId);
    if (!req.params.roomId) {
        return res.status(400).json({ error: 'Room ID is required' });
    }

    try {
        const room = await Room.findById(req.params.roomId).populate('propertyId', 'name location totalRooms ownerId');
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.status(200).json(room);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


exports.getPropertySummary = async (req, res) => {
   
    try {
        const propertyId = req.params.id;

        const rooms = await Room.find({ propertyId });
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ error: 'No rooms found for this property' });
        }

        let totalBeds = 0;
        let occupiedBeds = 0;
        let vacantBeds = 0;

        rooms.forEach(room => {
            totalBeds += room.beds.length;
            occupiedBeds += room.beds.filter(bed => bed.status === 'occupied').length;
            vacantBeds += room.beds.filter(bed => bed.status === 'vacant').length;
        });

        res.status(200).json({
            propertyId,
            totalRooms: rooms.length,
            totalBeds,
            occupiedBeds,
            vacantBeds,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getRoomAvailability = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;
    try {
        const roomId = req.params.roomId;
        const room = await Room.findById(roomId).populate('propertyId', 'name location totalRooms ownerId');
        if (!room) return res.status(404).json({ error: 'Room not found' });


        const property = await getOwnProperty(room.propertyId, currentUser);
        const availability = room.beds.map(bed => {
            if (bed.status === 'vacant') {
                return {
                    bedId: bed._id,
                    status: bed.status,
                    date: bed.date,
                };
            }

            return null;
        }).filter(bed => bed !== null);
        if (!availability || availability.length === 0) {
            return res.status(404).json({ error: 'No availability found for this room' });
        }
        res.status(200).json({
            propertyId: room.propertyId,
            roomId: room._id,
            PGname: property.name,
            roomNumber: room.roomNumber,
            Vacant_beds: availability.length,
            availability
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getRoomAvailabilityByType = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;

    try {
        const propertyId = req.params.id;
        const roomType = req.params.type;
        console.log(propertyId, roomType);
        const rooms = await Room.find({ propertyId, type: roomType }).populate('propertyId', 'name location totalRooms ownerId');
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ error: 'No rooms found for this property and type' });
        }

        let totalBeds = 0;
        let occupiedBeds = 0;
        let vacantBeds = 0;
        rooms.forEach(room => {
            totalBeds += room.beds.length;
            console.log(totalBeds);
            occupiedBeds += room.beds.filter(bed => bed.status === 'occupied').length;
            vacantBeds += room.beds.filter(bed => bed.status === 'vacant').length;
        });
        res.status(200).json({
            propertyId,
            roomType,
            totalRooms: rooms.length,
            totalBeds,
            occupiedBeds,
            vacantBeds,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getPropertySummaryByType = async (req, res) => {
    try {
        const propertyId = req.params.id;
        const rooms = await Room.find({
            propertyId
        });
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ error: 'No rooms found for this property' });
        }
        let totalTypes = 0;
        let typesSummary = {};
        let totalSummary = {};
        rooms.forEach(room => {
            if (!typesSummary[room.type]) {
                typesSummary[room.type] = {
                    totalRooms: 0,
                    totalBeds: 0,
                    occupiedBeds: 0,
                    vacantBeds: 0,
                };
            }
            typesSummary[room.type].totalRooms += 1;
            typesSummary[room.type].totalBeds += room.beds.length;
            typesSummary[room.type].occupiedBeds += room.beds.filter(bed => bed.status === 'occupied').length;
            typesSummary[room.type].vacantBeds += room.beds.filter(bed => bed.status === 'vacant').length;
            if (!typesSummary[room.type].rooms) {
                typesSummary[room.type].rooms = [];
            }
            typesSummary[room.type].rooms.push({
                roomId: room._id,
                roomNumber: room.roomNumber,
                type: room.type,
                status: room.status
            });
        });
        totalTypes = Object.keys(typesSummary).length;
        res.status(200).json({
            propertyId,
            totalTypes,
            typesSummary,
        });

    }
    catch (error) {
        res.status(500).json({ error: error.message });
    };
};

//GET /rooms/search?floor=2&type=double&status=available
exports.searchRooms = async (req, res) => {
    try {
        const { floor, type, status } = req.query;
        const query = {};
        const propertyId = req.params.id;
        if (!propertyId) {
            return res.status(400).json({ error: 'Property ID is required' });
        }

        if (status === 'available') {
            query.$or = [{ status: 'available' }, { status: 'partially occupied' }];
        }

        if (floor) {
            query.floor = floor;
        }
        if (type) {
            query.type = type;
        }
        if (status && status !== 'available') {
            query.status = status;
        }
        console.log(query);

        const rooms = await Room.find({ propertyId, ...query }).populate('propertyId', 'name location totalRooms ownerId');
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ error: 'No rooms found' });
        }
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.getRoomByTenantId = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user.pgpalId
    try {
        const tenantId = req.params.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant ID is required' });
        }
        const room = await Room.findOne({ tenantId }).populate('propertyId', 'name location totalRooms ownerId');
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.status(200).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getRoomDocs = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const currentUser = JSON.parse(req.headers['x-user']);

    const pppid = req.params.pppid;
    
    try {
        const roomDocs = await Room.countDocuments({ propertyId: pppid });
        if (roomDocs === 0) return res.status(404).json({ error: 'Room not found' });
        res.status(200).json({ count: roomDocs });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
}

exports.getBedDocs = async (req, res) => {
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const pppid = req.params.pppid;
    if (!pppid) {
        return res.status(400).json({ error: 'Property ID is required' });
    }

    const pppObjectId = new mongoose.Types.ObjectId(pppid);


    console.log(pppObjectId);
    try {
        const beds = await Room.aggregate([
            { $match: { propertyId: pppObjectId } },
            { $unwind: '$beds' },
            {
                $group: {
                    _id: '$propertyId', 
                    totalBeds: { $sum: 1 },
                    occupiedBeds: {
                        $sum: {
                            $cond: [
                                { $eq: ['$beds.status', 'occupied'] }, // Check if bed status is 'occupied'
                                1,
                                0
                            ]
                        }
                    },
                    availableBeds: {
                        $sum: {
                            $cond: [
                                { $eq: ['$beds.status', 'available'] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        if (!beds || beds.length === 0) {
            return res.status(404).json({ error: 'No beds found for the given property ID' });
        }

        res.status(200).json(beds);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
}