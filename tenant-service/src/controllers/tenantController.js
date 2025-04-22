const Tenant = require('../models/tenantModel');
const axios = require('axios');
const { generatePPT } = require('../utils/idGenerator'); // Assuming you have a function to generate PPT IDs

// Helper to fetch property & verify ownership
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
                    'x-internal-service': true
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('[assignBed] Error:', error.message);
        return null;
    }
};


exports.addTenant = async (req, res) => {
    try {
        const currentUser = JSON.parse(req.headers['x-user']);
        console.log(`Curr 1 `, currentUser);
        const role = currentUser.data.user.role;
        const ownerId = currentUser.data.user._id;
        const ownerPpid = currentUser.data.user.pgpalId;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Only owners can add tenants' });
        }

        const { name, email, phone, gender, address, aadhar, propertyId, roomNumber, bedId } = req.body;

        if (!name || !phone || !propertyId || !roomNumber || !bedId || !aadhar) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const property = await getOwnProperty(propertyId, currentUser);
        if (!property || property.ownerId !== ownerId) {
            return res.status(403).json({ error: 'You do not own this property' });
        }
        const propertyPPP = property.pgpalId;

        const room = await getRoomByNumber(propertyId, roomNumber, currentUser);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const roomPPR = room.pgpalId;

        const existing = await Tenant.findOne({ $or: [{ phone }, { aadhar }] });
        console.log('Exist ', existing);
        if (existing?.status === 'active' && existing?.phone === phone) {
            return res.status(400).json({ error: 'Tenant with this phone already exists' });
        }
        console.log(existing?.status, existing?.aadhar, aadhar);
        if (existing?.status === 'active' && existing?.aadhar == aadhar) {
            return res.status(400).json({ error: 'Tenant with this aadhar already exists' });
        }

        const bed = room.beds.find(b => b.bedId === bedId);

        if (!bed || bed.status === 'occupied') {
            return res.status(400).json({ error: 'Bed not available' });
        }



        let tenantPpt;
        // Create tenant
        const existingUser = await getUserByPhone(phone, currentUser);
        if (!existingUser) {
            let newppt = generatePPT();
            let existingPpt = await getUserByPpid(newppt, currentUser);
            while (existingPpt) {
                newppt = generatePPT();
                existingPpt = await getUserByPpid(newppt, currentUser);
            }
            tenantPpt = newppt;
        } else {
            tenantPpt = existingUser.pgpalId;
        }

        const assigned = await assignBed(room._id, bedId, phone, tenantPpt, currentUser);
        if (assigned?.status !== 200) {
            return res.status(400).json({ error: 'Failed to assign bed' });
        }

        const tenantData = {
            name,
            phone,
            gender,
            address,
            pgpalId: tenantPpt,
            aadhar,
            currentStay: {
                propertyPpid: propertyPPP,
                roomPpid: roomPPR,
                rent: room.rentPerBed,
                bedId
            },
            createdBy: ownerId
        };

        if (email) {
            tenantData.email = email;
        }

        const tenant = await Tenant.create(tenantData);

        res.status(201).json({
            message: 'Tenant added and assigned successfully',
            tenant
        });

    } catch (err) {
        console.error('[addTenant] Error:', err);
        res.status(500).json({ error: err.message });
    }
};


// ✅ Get all tenants (owned or added by this PG owner)
exports.getTenants = async (req, res) => {
    try {
        const currentUser = JSON.parse(req.headers['x-user']);
        const role = currentUser.data.user.role;
        const ownerid = currentUser.data.user._id;
        console.log(ownerid, role);

        const myPG = await getOwnProperty(ownerid, currentUser);
        let tenants;
        if (role === 'owner') {
            tenants = await Tenant.find({ createdBy: currentUser.data.user._id });
        } else {
            tenants = await Tenant.find(); // For admin role or future use
        }

        res.status(200).json(tenants);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ✅ Get tenant by ID
exports.getTenantByQuery = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    const _id = req.query.id;
    const status = req.query.status;

    try {
        const tenant = await Tenant.find({ $or: [{ phone }, { pgpalId }, { _id }, { status }] });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);
        console.log(ppId[0]);
        res.status(200).json(tenant);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getTenantByPhNum = async (req, res) => {
    console.log('getTenantByPhNum called');
    const internalService = req.headers['x-internal-service'];
    if (!internalService) return res.status(403).json({ error: 'Forbidden, Access denied' });

    const phone = req.params.phnum;

    try {
        const tenant = await Tenant.find({ phone });
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        const ppId = tenant.map((t) => t.pgpalId);
        console.log(ppId[0]);
        res.status(200).json(ppId[0]);
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
};

// ✅ Update tenant
exports.updateTenant = async (req, res) => {
    try {
        const updates = req.body;

        const updatedTenant = await Tenant.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true
        });

        if (!updatedTenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.status(200).json({ message: 'Tenant updated successfully', updatedTenant });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// ✅ Delete tenant
exports.deleteTenant = async (req, res) => {
    try {
        const deleted = await Tenant.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Tenant not found' });

        res.status(200).json({ message: 'Tenant deleted successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
