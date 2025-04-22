const Room = require('../models/roomModel');
const axios = require('axios');

const getOwnProperty = async (propertyId, currentUser) => {
    try {
        const response = await axios.get(`http://localhost:4000/api/property-service/property/${propertyId}`,
            {
                headers: {
                    'x-internal-service': true,
                    'x-user': JSON.stringify(currentUser),
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('[getOwnProperty] Error:', error.response?.data || error.message);
        return null;
    }
};

exports.addRoom = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;

    const currentRoomCount = await Room.countDocuments({ propertyId: req.body.propertyId });
    console.log(currentRoomCount);

    if (role !== 'owner') {
        return res.status(403).json({ error: 'Forbidden: Only owners can add rooms' });
    }

    const propertyId = req.body.propertyId;

    if (!propertyId) {
        return res.status(400).json({ error: 'Property ID is required' });
    }

    const property = await getOwnProperty(propertyId, currentUser);

    if (!property) {
        return res.status(404).json({ error: 'Property not found' });
    }

    if (property.ownerId.toString() !== id) {
        return res.status(403).json({ error: `Forbidden: You didn't own this property` });
    }

    if (!id) {
        return res.status(401).json({ error: 'Unauthorized: Missing userId' });
    }

    const rooms = await Room.find({ propertyId });

    const roomTypeBedMap = {
        single: 1,
        double: 2,
        triple: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8
    };


    try {
        const { propertyId, roomNumber, floor, type, beds, rentPerBed } = req.body;
        let status = 'available';

        let totalBeds = roomTypeBedMap[type];
        if (!totalBeds) {
            return res.status(400).json({ error: 'Invalid room type' });
        }

        if (rooms.some(room => room.roomNumber === roomNumber)) {
            return res.status(400).json({ error: 'Room number already exists' });
        }

        if (currentRoomCount >= property.totalRooms) {
            return res.status(400).json({ error: 'Room limit reached for this property' });
        }

        if (beds.length !== totalBeds) {
            return res.status(400).json({ error: `Number of beds should be ${totalBeds}` });
        }

        if (beds.some(bed => bed.status !== 'vacant' && bed.status !== 'occupied')) {
            return res.status(400).json({ error: 'Invalid bed status' });
        }

        if (beds.some(bed => bed.tenantNo && bed.status !== 'occupied')) {
            return res.status(400).json({ error: 'Tenant number can only be assigned to occupied beds' });
        }

        if (beds.some(bed => bed.tenantNo && !bed.status)) {
            return res.status(400).json({ error: 'Tenant number is required for occupied beds' });
        }

        if (beds.some(bed => bed.tenantNo && bed.status === 'vacant')) {
            return res.status(400).json({ error: 'Tenant number cannot be assigned to vacant beds' });
        }

        if (beds.every(bed => bed.status === 'vacant')) {
            status = 'vacant';
        } else if (beds.every(bed => bed.status === 'occupied')) {
            status = 'occupied';
        } else {
            status = 'partially occupied';
        }

        const bedsWithIds = beds.map((bed, index) => ({
            ...bed,
            bedId: `${roomNumber}-B${index + 1}` // Assign a unique bedId based on roomNumber and index
        }));

        const room = await Room.create({
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
            updatedByRole: currentUser.data.user.role,
        });
        if (!room) {
            return res.status(400).json({ error: 'Failed to create room' });
        }

        res.status(201).json(room);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


exports.updateRoom = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};

    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;

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

        const { roomNumber, floor, type, beds, rentPerBed } = req.body;

        const room = await Room.findById(req.params.roomId);
        const propertyId = room.propertyId;
        const property = await getOwnProperty(propertyId, currentUser);

        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }
        if (property.ownerId.toString() !== id) {
            return res.status(403).json({ error: `Forbidden: You didn't own this property` });
        }

        if (!room) return res.status(404).json({ error: 'Room not found' });

        const duplicate = await Room.findOne({
            roomNumber: req.body.roomNumber,
            propertyId: room.propertyId,
            _id: { $ne: room._id }
        });
        if (duplicate) {
            return res.status(400).json({ error: 'Room number already exists for this property' });
        }

        const roomTypeBedMap = {
            single: 1,
            double: 2,
            triple: 3,
            four: 4,
            five: 5,
            six: 6,
            seven: 7,
            eight: 8
        };


        let totalBeds = roomTypeBedMap[type];
        if (!totalBeds) {
            return res.status(400).json({ error: 'Invalid room type' });
        }

        let status = 'available';

        if (beds.length !== totalBeds) {
            return res.status(400).json({ error: `Number of beds should be ${totalBeds}` });
        }

        if (beds.some(bed => bed.status !== 'vacant' && bed.status !== 'occupied')) {
            return res.status(400).json({ error: 'Invalid bed status' });
        }

        if (beds.some(bed => bed.tenantNo && bed.status !== 'occupied')) {
            return res.status(400).json({ error: 'Tenant number can only be assigned to occupied beds' });
        }

        if (beds.some(bed => !bed.tenantNo && bed.status === 'occupied')) {
            return res.status(400).json({ error: 'Tenant number is required for occupied beds' });
        }

        if (beds.some(bed => bed.tenantNo && bed.status === 'vacant')) {
            return res.status(400).json({ error: 'Tenant number cannot be assigned to vacant beds' });
        }

        if (beds.every(bed => bed.status === 'vacant')) {
            status = 'vacant';
        } else if (beds.every(bed => bed.status === 'occupied')) {
            status = 'occupied';
        } else {
            status = 'partially occupied';
        }

        const bedsWithIds = beds.map((bed, index) => ({
            ...bed,
            bedId: `${roomNumber}-B${index + 1}` // Assign a unique bedId based on roomNumber and index
        }));

        const updateData = {
            roomNumber,
            floor,
            type,
            rentPerBed,
            totalBeds,
            beds: bedsWithIds,
            status,
            updatedBy: id,
            updatedByName: currentUser.data.user.username,
            updatedByRole: currentUser.data.user.role,
        };

        const updateRoom = await Room.findByIdAndUpdate(req.params.roomId, updateData, { new: true });

        res.status(200).json({ message: 'Room updated successfully', updateRoom });

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteRoom = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']) || {};

    const id = currentUser.data.user._id;
    const role = currentUser.data.user.role;

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
        const room = await Room.findByIdAndDelete(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.status(200).json({ message: 'Room deleted successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

