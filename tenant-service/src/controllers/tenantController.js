const Tenant = require('../models/tenantModel');
const { generatePPT } = require('../utils/idGenerator'); // Assuming you have a function to generate PPT IDs
const {assignBed, getOwnProperty, getUserByPhone, getRoomByNumber, getUserByPpid} = require('./internalApis'); // Assuming you have a function to generate PPT IDs

// Helper to fetch property & verify ownership

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

        const { name, email, phone, gender, address, aadhar, propertyId, roomNumber, bedId, deposit, noticePeriodInMonths } = req.body;

        if (!name || !phone || !propertyId || !roomNumber || !bedId || !aadhar || deposit === undefined || noticePeriodInMonths === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const property = await getOwnProperty(propertyId, currentUser, ppid=false);
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

        const assigned = await assignBed(roomPPR, bedId, phone, tenantPpt, currentUser);
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
                deposit: deposit,
                noticePeriodInMonths: noticePeriodInMonths,
                isInNoticePeriod: false,
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


// ✅ Update tenant
exports.updateTenant = async (req, res) => {
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    const _id = req.query.id;
    try {
        const updates = req.body;

        const updatedTenant = await Tenant.findByIdAndUpdate({ $or: [{ phone }, { pgpalId }, { _id }] }, updates, {
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
    const phone = req.query.phnum;
    const pgpalId = req.query.ppid;
    try {
        const deleted = await Tenant.findOneAndDelete({ $or: [{ phone }, { pgpalId }] });
        if (!deleted) return res.status(404).json({ error: 'Tenant not found' });

        res.status(200).json({ message: 'Tenant deleted successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
