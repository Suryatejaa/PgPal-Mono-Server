const { json } = require('express');
const Property = require('../models/propertyModel');
const axios = require('axios');
const mongoose = require('mongoose');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');



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
        const ppid = currentUser.data.user.pgpalId;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can add properties' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }

        try {
            const { name, contact, address, totalBeds, totalRooms, occupiedBeds } = req.body;

            if (!name || !address || !contact || !address) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const availableBeds = totalBeds - occupiedBeds;
            if (availableBeds < 0) {
                return res.status(400).json({ error: 'Occupied beds cannot exceed total beds' });
            }
            const property = await Property.create({
                ownerId: id,
                createdBy: id,
                name,
                contact: { phone: phone, email: email },
                address,
                totalRooms,
                totalBeds,
                occupiedBeds,
                availableBeds,
            });

            const propertyPpid = property.pgpalId;
            console.log('Property PPID ', propertyPpid);

            const title = 'New Property Added';
            const message = 'A new property has been successfully registered.';
            const type = 'info';
            const method = ['in-app'];

            try {
                console.log('Adding notification job to the queue...');

                await notificationQueue.add('notifications', {
                    tenantIds: [ppid],
                    propertyPpid,
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

            const response = properties.map(property => ({ ...property._doc, views: property.views }));

            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
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

            await increaseViewCount(req.params.id);

            const response = { ...property._doc, views: property.views };

            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyForRoom(req, res) {
        const id = req.params.id;
        const ppid = req.query.ppid;
        console.log('Called getPropertyforRoom ', id);
        try {

            const property = await Property.findById(id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const response = { ...property._doc, views: property.views };
            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyByPpid(req, res) {
        const ppid = req.params.ppid;

        try {
            const property = await Property.findOne({ pgpalId: ppid });

            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            const response = { ...property._doc, views: property.views };
            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
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

            const response = properties.map(property => ({ ...property._doc, views: property.views }));
            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
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

            const response = {
                totalProperties,
                totalRooms: totalRooms[0]?.totalRooms || 0,
                totalBeds: totalBeds[0]?.totalBeds || 0,
            };
            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async updateProperty(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const ppid = currentUser.data.user.pgpalId;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can update properties' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }

        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own properties' });
            }

            // Proceed with the update
            const updatedProperty = await Property.findOneAndUpdate(
                { _id: req.params.id, ownerId: id },
                req.body,
                { new: true }
            );

            const propertyPpid = updatedProperty.pgpalId;
            await invalidateCacheByPattern(`*${propertyPpid}*`);

            const title = 'Property Details Updated';
            const message = 'Property details have been updated. Please review the latest information.';
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

            res.status(200).json(updatedProperty);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteProperty(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const ppid = currentUser.data.user.pgpalId;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can delete properties' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }


        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only delete your own properties' });
            }

            // Proceed with the deletion
            await Property.findByIdAndDelete(req.params.id);

            const propertyPpid = property.pgpalId;

            const title = 'Property Removed';
            const message = 'A property has been deleted from the system.';
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

            const response = properties;
            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
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
            const propertyObj = property.toObject();

            const response = propertyObj.availableBeds || {};
            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async updateAvailability(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const ppid = currentUser.data.user.pgpalId;

        try {
            const { availability } = req.body;

            const getProperty = await Property.findById(req.params.id);
            if (!getProperty) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (getProperty.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own properties' });
            }

            const property = await Property.findByIdAndUpdate(
                req.params.id,
                { availability },
                { new: true }
            );
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const propertyPpid = property.pgpalId;

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

            res.status(200).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async getOwnerInfo(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};

        const propertyId = req.params.id;

        const isValidObjectId = mongoose.Types.ObjectId.isValid(propertyId);

        let property;

        if (!isValidObjectId) {
            property = await Property.findOne({ pgpalId: propertyId });
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
        }
        else {
            property = await Property.findById(propertyId);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
        }

        try {
            const owner = await axios.get(`http://auth-service:4001/api/auth-service/user?id=${property.ownerId}`,
                {
                    headers: {
                        'x-internal-service': 'true',
                    },
                }
            );

            const response = {
                ownerId: property.ownerId,
                ownerName: owner.data.username,
                ownerEmail: owner.data.email,
                ownerPhone: owner.data.phoneNumber
            };
            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async updateTotalBeds(req, res) {
        console.log('method called');
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can update properties' });
        }

        try {
            const { totalBeds, totalRooms, occupiedBeds, availableBeds } = req.body;

            console.log(req.params.id);
            console.log(totalBeds);

            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own properties' });
            }

            property.totalBeds = totalBeds;
            await Property.updateOne({ _id: req.params.id }, { totalBeds, totalRooms, occupiedBeds, availableBeds });

            await invalidateCacheByPattern(`*${property.pgpalId}*`);

            res.status(200).json({
                message: 'Total beds updated successfully', totalRooms,
                totalBeds,
                occupiedBeds,
                availableBeds
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

};
