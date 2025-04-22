const { json } = require('express');
const Property = require('../models/propertyModel');
const axios = require('axios');

const increaseViewCount = async (id) => {
    const property = await Property.findById(id);
    if (!property) {
        throw new Error('Property not found');
    }
    await Property.findByIdAndUpdate(id, {
        $inc: { views: 1 },
    }, {
        new: true

    });
    return property;
};


module.exports = {
    async addProperty(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};

        console.log('Current User:', currentUser);
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const phone = currentUser.data.user.phoneNumber;
        const email = currentUser.data.user.email;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can add properties' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }

        try {
            const { name, address, totalBeds, totalRooms, occupiedBeds } = req.body;
            const availableBeds = totalBeds - occupiedBeds;
            if (availableBeds < 0) {
                return res.status(400).json({ error: 'Occupied beds cannot exceed total beds' });
            }
            const property = await Property.create({ name, address, ownerId: id, totalBeds, totalRooms, occupiedBeds, availableBeds, createdBy: id, contact: { phone: phone, email: email } });
            res.status(201).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async getProperties(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Since you are a tenant, you dont own any properties' });
        }
        try {
            const properties = await Property.find({ ownerId: id });
            if (!properties || properties.length === 0) {
                return res.status(404).json({ error: 'No properties found' });
            }
            // Increase view count for each property
            for (const property of properties) {
                await increaseViewCount(property._id);
            }
            res.status(200).json(properties.map(property => ({ ...property._doc, views: property.views })));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyById(req, res) {
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            // Increase view count for the property
            await increaseViewCount(req.params.id);
            // Return the property with updated view count
            res.status(200).json({ ...property._doc, views: property.views });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyForRoom(req, res) {
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            res.status(200).json({ ...property._doc, views: property.views });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getAllProperties(req, res) {
        try {
            const properties = await Property.find();
            if (!properties || properties.length === 0) {
                return res.status(404).json({ error: 'No properties found' });
            }
            for (const property of properties) {
                await increaseViewCount(property._id);
            }
            res.status(200).json(properties.map(property => ({ ...property._doc, views: property.views })));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async analytics(req, res) {
        try {
            const totalProperties = await Property.countDocuments();
            const totalRooms = await Property.aggregate([
                { $group: { _id: null, totalRooms: { $sum: "$totalRooms" } } }
            ]);
            const totalBeds = await Property.aggregate([
                { $group: { _id: null, totalBeds: { $sum: "$totalBeds" } } }
            ]);

            res.status(200).json({
                totalProperties,
                totalRooms: totalRooms[0]?.totalRooms || 0,
                totalBeds: totalBeds[0]?.totalBeds || 0,
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async updateProperty(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can update properties' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }


        try {
            const property = await Property.findOneAndUpdate(
                { _id: req.params.id, ownerId: id },
                req.body,
                { new: true }
            );
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            res.status(200).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteProperty(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can delete properties' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }


        try {
            const property = await Property.findOneAndDelete({
                _id: req.params.id,
                ownerId: id,
            });
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            res.status(200).json({ message: 'Property deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async searchProperties(req, res) {  
        try {
            const { city, state, query } = req.query;
            const searchCriteria = [];
            if (query) {
                searchCriteria.push(
                    { name: { $regex: query, $options: 'i' } },
                    { 'address.city': { $regex: query, $options: 'i' } },
                    { 'address.state': { $regex: query, $options: 'i' } }
                );
            }
            if (city) {
                searchCriteria.push({ 'address.city': { $regex: city, $options: 'i' } });
            }
            if (state) {
                searchCriteria.push({ 'address.state': { $regex: state, $options: 'i' } });
            }
            const properties = await Property.find({
                $or: searchCriteria.length ? searchCriteria : [{}],
            });

            res.status(200).json(properties);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async getAvailability(req, res) {
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            res.status(200).json(property.availability || {});
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async updateAvailability(req, res) {
        try {
            const { availability } = req.body;
            const property = await Property.findByIdAndUpdate(
                req.params.id,
                { availability },
                { new: true }
            );
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            res.status(200).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async getOwnerInfo(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        try {
            const property = await Property.findById(req.params.id).populate('ownerId', 'username email phoneNumber');
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            const owner = await axios.get(`http://localhost:4000/api/auth-service/user/${property.ownerId}`,
                {
                    headers: {
                        'x-internal-service': 'true',
                    },
                }
            );

            res.status(200).json({
                ownerId: property.ownerId,
                ownerName: owner.data.username,
                ownerEmail: owner.data.email,
                ownerPhone: owner.data.phoneNumber
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

};
