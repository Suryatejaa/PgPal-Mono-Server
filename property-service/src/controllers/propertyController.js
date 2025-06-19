const { json } = require('express');
const Property = require('../models/propertyModel');
const DeletedProperty = require('../models/deletedPropertiesModal.js');
const axios = require('axios');
const mongoose = require('mongoose');
const CacheHelper = require('../utils/CacheHelper');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const moment = require('moment');
const { PLAN_LIMITS, getSuggestedPlan } = require('../middleware/planValidates.js');
const {
    getActiveTenantsForProperty,
    getStayRecordsFromTenantService,
    removeAllTenantsFromProperty
} = require('./internalApis');
const PlanHelper = require('../utils/planHelper');
const PlanLimits = require('../config/planLimits.js');
const WebSocketEmitter = require('../utils/WebSocketEmitter.js');
const wsEmitter = new WebSocketEmitter('property-service');


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

        //console.log('Current User:', currentUser);
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const phone = currentUser.data.user.phoneNumber;
        const email = currentUser.data.user.email;

        const userPlan = currentUser.data.user.currentPlan || { type: 'free' };
        const planType = userPlan.type || 'free';
        const planLimits = PLAN_LIMITS[planType];

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can add properties' });
        }

        // ✅ Check plan limits before adding property
        const totalOwnedProperties = await Property.countDocuments({ ownerId: id });

        if (planLimits.maxProperties !== -1 && totalOwnedProperties >= planLimits.maxProperties) {
            return res.status(403).json({
                code: 'PROPERTY_LIMIT_REACHED',
                error: `Property limit reached. Your ${planType} plan allows ${planLimits.maxProperties} properties.`,
                currentCount: totalOwnedProperties,
                maxAllowed: planLimits.maxProperties,
                upgradeRequired: true,
                suggestedPlan: getSuggestedPlan(totalOwnedProperties + 1)
            });
        }

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can add properties' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }



        try {
            const { name, address, contact, rentRange, depositRange, pgGenderType, location } = req.body;
            const availableBeds = 0;

            //console.log('checkpoint 2');
            console.log(location);
            let lng = Number(location?.coordinates?.[0]);
            let lat = Number(location?.coordinates?.[1]);
            console.log(lng, lat);

            if (
                typeof lng !== 'number' || isNaN(lng) ||
                typeof lat !== 'number' || isNaN(lat)
            ) {
                return res.status(400).json({ error: 'Invalid or missing location coordinates' });
            }

            const maxRoomsAllowed = planLimits.maxRoomsPerProperty || -1;
            const maxBedsAllowed = planLimits.maxBedsPerProperty || -1;

            const property = await Property.create({
                name,
                address,
                ownerId: id,
                totalBeds: 0,
                totalRooms: 0,
                occupiedBeds: 0,
                pgGenderType,
                availableBeds,
                rentRange: {
                    min: rentRange.min,
                    max: rentRange.max
                },
                depositRange: {
                    min: depositRange.min,
                    max: depositRange.max
                },
                ownerContact: {
                    phone,
                    email
                },
                location: {
                    type: "Point",
                    coordinates: [lng, lat]
                },
                contact,
                maxRoomsAllowed,
                maxBedsAllowed,
                createdBy: id
            });

            const propertyPpid = property.pgpalId;
            //console.log('Property PPID ', propertyPpid);

            const title = 'New Property Added';
            const message = 'A new property has been successfully registered.';
            const type = 'info';
            const method = ['in-app'];

            try {
                //console.log('Adding notification job to the queue...');

                await notificationQueue.add('notifications', {
                    ownerId: currentUser?.data?.user?.pgpalId,
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

                //console.log('Notification job added successfully');

            } catch (err) {
                console.error('Failed to queue notification:', err.message);
            }

            await wsEmitter.notifyPropertyUpdate({
                action: 'property-added',
                property: {
                    id: property._id,
                    name: property.name,
                    location: property.location,
                    ownerId: property.ownerId
                }
            }, currentUser.data.user._id);

            res.status(201).json(property);


        } catch (error) {
            //console.log(error.message);
            res.status(500).json({ error: error.message });
        }
    },

    async updateMaxRoomsnBeds(req, res) {
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
        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can update max rooms and beds' });
        }
        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }
        try {
            const { currentPlan } = req.body;
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own properties' });

            }
            const { maxRoomsPerProperty, maxBedsPerProperty } = PLAN_LIMITS[currentPlan] || {};
            if (maxRoomsPerProperty === undefined || maxBedsPerProperty === undefined) {
                return res.status(400).json({ error: 'Invalid plan limits' });
            }

            // Proceed with the update
            const updatedProperty = await Property.findByIdAndUpdate(
                req.params.id,
                { maxRoomsAllowed: maxRoomsPerProperty, maxBedsAllowed: maxBedsPerProperty },

                { new: true }
            );
            const propertyPpid = updatedProperty.pgpalId;
            await invalidateCacheByPattern(`*${propertyPpid}*`);
            await invalidateCacheByPattern(`*${property._id}*`);


            res.status(200).json(updatedProperty);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getProperties(req, res) {
        try {
            const xUserHeader = req.headers['x-user'];
            // Check if x-user header is present
            console.log('🔍 [getProperties] x-user header:', xUserHeader);
            if (!xUserHeader) {
                return res.status(401).json({ error: 'User header not found' });
            }
            let currentUser;
            try {
                currentUser = JSON.parse(xUserHeader);
            } catch (e) {
                console.error('Error parsing x-user header:', e);
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Log user structure for debugging
            if (req.headers['x-debug']) {
                console.log('🔍 [getProperties] Debug - currentUser structure:', {
                    hasData: !!currentUser.data,
                    hasUser: currentUser.data?.user ? true : false,
                    userId: currentUser.data?.user?._id || currentUser._id || 'missing',
                    role: currentUser.data?.user?.role || currentUser.role || 'missing'
                });
            }

            const id = currentUser?.data?.user?._id || currentUser?._id;
            const role = currentUser?.data?.user?.role || currentUser?.role;
            const plan = currentUser?.data?.user?.currentPlan || { type: 'free' };

            const maxRoomsAllowed = PlanLimits[plan]?.maxRoomsPerProperty || -1;
            const maxBedsAllowed = PlanLimits[plan]?.maxBedsPerProperty || -1;

            if (!id || !role) {
                const error = new Error('Missing user ID or role in request');
                console.error('❌ [getProperties] Authorization error:', {
                    id,
                    role,
                    structure: {
                        hasData: !!currentUser.data,
                        hasDataUser: !!(currentUser.data && currentUser.data.user),
                        hasDirectProps: !!(currentUser._id && currentUser.role)
                    }
                });
                return res.status(401).json({
                    error: 'Unauthorized: Invalid user data',
                    details: 'Missing required user identification or role information'
                });
            }

            if (role !== 'owner') {
                return res.status(403).json({
                    error: 'Forbidden: Since you are a tenant, you dont own any properties',
                    role: role,
                    requiredRole: 'owner'
                });
            }

            console.log(`🔍 [getProperties] Searching for properties with ownerId: ${id}`);

            // Try to fetch properties
            const properties = await Property.find({ ownerId: id });
            const updateRoomsnBeds = await Property.updateMany(
                { ownerId: id },
                {
                    $set: {
                        maxRoomsAllowed,
                        maxBedsAllowed
                    }
                }
            );

            if (!properties || properties.length === 0) {
                console.log(`📭 [getProperties] No properties found for user ${id}`);
                return res.status(404).json({
                    error: 'No properties found',
                    details: 'No properties are associated with this user account'
                });
            }

            const response = properties.map(property => ({
                ...property._doc,
                views: property.views || 0
            }));

            console.log(`✅ [getProperties] Found ${properties.length} properties for user ${id}`);
            res.status(200).json(response);

        } catch (error) {
            // Enhanced error logging with stack trace
            console.error('❌ [getProperties] Unhandled error:', {
                message: error.message,
                stack: error.stack,
                url: req.originalUrl,
                method: req.method,
                user: req.headers['x-user'] ? 'Present' : 'Missing'
            });

            res.status(500).json({
                error: error.message,
                details: 'An unexpected error occurred while fetching properties',
                path: req.path,
                timestamp: new Date().toISOString()
            });
        }
    },

    async getPropertyById(req, res) {
        const userHeader = req.headers['x-user'];
        if (!userHeader) {
            return res.status(401).json({ error: 'Unauthorized: Missing user authentication' });
        }

        let currentUser;
        try {
            currentUser = JSON.parse(userHeader);
        } catch (error) {
            return res.status(401).json({ error: 'Unauthorized: Invalid user data format' });
        }

        if (!currentUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const cacheKey = '/api' + req.originalUrl; // Always add /api
        try {
            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).send(cached);
                }
            }
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            await increaseViewCount(req.params.id);

            const response = { ...property._doc, views: property.views };
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyForRoom(req, res) {
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
        const id = req.params.id;
        const ppid = req.query.ppid;
        //console.log('Called getPropertyforRoom ', id);
        const cacheKey = '/api' + req.originalUrl; // Always add /api

        try {
            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).json(cached);
                }
            }
            const property = await Property.findById(id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const response = { ...property._doc, views: property.views };
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyByPpid(req, res) {
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
        const ppid = req.params.ppid;
        const cacheKey = '/api' + req.originalUrl; // Always add /api

        try {

            if (CacheHelper.isReady()) {
                console.log('CacheHelper is ready');
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).json(cached);
                }
            }

            const property = await Property.findOne({ pgpalId: ppid });

            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const response = { ...property._doc, views: property.views };
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getAllPropertiesInternal(req, res) {

        const internalServiceHeader = req.headers['x-internal-service'];
        if (!internalServiceHeader || internalServiceHeader !== 'true') {
            return res.status(403).json({ error: 'Forbidden: This endpoint is for internal use only' });
        }

        const cacheKey = '/api' + req.originalUrl; // Always add /api

        try {
            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).json(cached);
                }
            }
            const properties = await Property.find();
            if (!properties || properties.length === 0) {
                return res.status(404).json({ error: 'No properties found' });
            }
            for (const property of properties) {
                await increaseViewCount(property._id);
            }

            const response = properties.map(property => ({ ...property._doc, views: property.views }));
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            console.log(error.message);
            res.status(500).json({ error: error.message });
        }
    },

    async getAllProperties(req, res) {
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
        const cacheKey = '/api' + req.originalUrl; // Always add /api
        try {
            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).json(cached);
                }
            }
            const properties = await Property.find();
            if (!properties || properties.length === 0) {
                return res.status(404).json({ error: 'No properties found' });
            }
            for (const property of properties) {
                await increaseViewCount(property._id);
            }

            const response = properties.map(property => ({ ...property._doc, views: property.views }));
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async analytics(req, res) {
        const cacheKey = '/api' + req.originalUrl; // Always add /api
        try {

            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).json(cached);
                }
            }

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
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async updateProperty(req, res) {
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
            await invalidateCacheByPattern(`*${property._id}*`);

            const title = 'Property Details Updated';
            const message = `Property ${updatedProperty.name} details have been updated. Please review the latest information.`;
            const type = 'alert';
            const method = ['in-app', 'email'];

            const tenants = await getActiveTenantsForProperty(propertyPpid); // Implement this utility
            for (const tenant of tenants) {
                await notificationQueue.add('notifications', {
                    tenantId: tenant.pgpalId,
                    propertyPpid,
                    audience: 'tenant',
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
            }

            res.status(200).json(updatedProperty);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteProperty(req, res) {
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
            const propertyPpid = property.pgpalId;

            const removedTenants = await removeAllTenantsFromProperty(propertyPpid, currentUser);
            if (!removedTenants) {
                return res.status(404).json({ error: 'Failed to remove tenants from property' });
            }

            // Move property to DeletedProperty collection
            const deletedProperty = new DeletedProperty({
                ...property.toObject(),
                deletedAt: new Date(),
                deletedBy: id
            });

            await deletedProperty.save();

            const deleted = await Property.findByIdAndDelete(req.params.id);
            if (!deleted) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const title = 'Property Removed';
            const message = 'Your property has been successfully removed from the system. If you have any questions, please contact support.';
            const type = 'alert';
            const method = ['in-app', 'email'];

            await notificationQueue.add('notifications', {
                ownerId: ppid,
                propertyPpid,
                audience: 'owner',
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


            await invalidateCacheByPattern(`*${propertyPpid}*`);
            await invalidateCacheByPattern(`*${property._id}*`);

            res.status(200).json({ message: 'Property deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getNearbyProperties(req, res) {

        try {
            const { latitude, longitude, maxDistance = 5000 } = req.query; // maxDistance in meters (default 5km)
            if (!latitude || !longitude) {
                return res.status(400).json({ error: 'Latitude and longitude are required' });
            }

            const properties = await Property.find({
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [parseFloat(longitude), parseFloat(latitude)]
                        },
                        $maxDistance: parseInt(maxDistance)
                    }
                }
            });

            res.status(200).json(properties);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async searchProperties(req, res) {
        try {
            const { city, state, query, pgGenderType } = req.query;
            const searchCriteria = [];
            const cacheKey = '/api' + req.originalUrl; // Always add /api
            console.log(query, city, state, pgGenderType);
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
            if (pgGenderType) {
                searchCriteria.push({ pgGenderType: { $regex: pgGenderType, $options: 'i' } });
            }

            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
                }
            }

            const properties = await Property.find({
                $or: searchCriteria.length ? searchCriteria : [{}],
            });

            const response = properties;
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getAvailability(req, res) {
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
        const cacheKey = '/api' + req.originalUrl; // Always add /api
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).json(cached);
                }
            }

            const propertyObj = property.toObject();

            const response = propertyObj.availableBeds || {};
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async updateAvailability(req, res) {
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

            await invalidateCacheByPattern(`*${propertyPpid}*`);
            await invalidateCacheByPattern(`*${property._id}*`);

            res.status(200).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    async getOwnerInfo(req, res) {
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
        const propertyId = req.params.id;

        const isValidObjectId = mongoose.Types.ObjectId.isValid(propertyId);

        let property;
        const cacheKey = '/api' + req.originalUrl; // Always add /api

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

            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    //console.log('Returning cached username availability');
                    return res.status(200).json(cached);
                }
            }

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
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async updateTotalBeds(req, res) {
        //console.log('method called');
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
        const plan = currentUser.data.user.currentPlan;

        console.log(currentUser.data.user);
        console.log(plan);
        console.log(currentUser);

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can update properties' });
        }

        try {
            const { totalBeds, totalRooms, occupiedBeds, availableBeds } = req.body;

            //console.log(req.params.id);
            //console.log(totalBeds);

            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own properties' });
            }

            // Check plan limits for rooms and beds per property

            const planLimits = PLAN_LIMITS[plan];

            if (planLimits.maxRoomsPerProperty !== -1 && totalRooms > planLimits.maxRoomsPerProperty) {
                return res.status(403).json({
                    error: `Room limit reached. Your ${planType} plan allows ${planLimits.maxRoomsPerProperty} rooms per property.`,
                    currentCount: totalRooms,
                    maxAllowed: planLimits.maxRoomsPerProperty,
                    upgradeRequired: true,
                    suggestedPlan: getSuggestedPlan(totalRooms + 1)
                });
            }

            if (planLimits.maxBedsPerProperty !== -1 && totalBeds > planLimits.maxBedsPerProperty) {
                return res.status(403).json({
                    error: `Bed limit reached. Your ${planType} plan allows ${planLimits.maxBedsPerProperty} beds per property.`,
                    currentCount: totalBeds,
                    maxAllowed: planLimits.maxBedsPerProperty,
                    upgradeRequired: true,
                    suggestedPlan: getSuggestedPlan(totalBeds + 1)
                });
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
    },

    async updateLocation(req, res) {
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

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can update property location' });
        }

        try {
            let { lat, lng, latitude, longitude } = req.body;
            if (typeof latitude === 'number' && typeof longitude === 'number') {
                lat = latitude;
                lng = longitude;
            }
            if (typeof lat !== 'number' || typeof lng !== 'number') {
                return res.status(400).json({ error: 'Latitude and longitude must be numbers' });
            }

            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own properties' });
            }

            const location = {
                type: "Point",
                coordinates: [lng, lat]
            };
            const updatedProperty = await Property.findByIdAndUpdate(
                req.params.id,
                { location },
                { new: true }
            );

            const propertyPpid = updatedProperty.pgpalId;
            const title = 'Property Location Updated';
            const message = `Property ${updatedProperty.name} location has been updated. You can navigate to it using maps`;
            const type = 'alert';
            const method = ['in-app', 'email'];

            const tenants = await getActiveTenantsForProperty(propertyPpid); // Implement this utility
            for (const tenant of tenants) {
                await notificationQueue.add('notifications', {
                    tenantId: tenant.pgpalId,
                    propertyPpid,
                    audience: 'tenant',
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
            }

            await invalidateCacheByPattern(`*${property.pgpalId}*`);

            res.status(200).json({
                message: 'Location updated successfully',
                location: updatedProperty.location
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async occupancyTrend(req, res) {
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

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can view occupancy trends' });
        }

        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only view your own properties' });
            }

            const getStayRecords = await getStayRecordsFromTenantService(property.pgpalId, currentUser);
            if (!getStayRecords || getStayRecords.length === 0) {
                return res.status(204).json({ error: 'No stay records found for this property' });
            }

            // Calculate trend for last 6 months
            const months = 6;
            const totalBeds = property.totalBeds || 1; // fallback to 1 to avoid division by zero
            const trend = [];

            for (let i = months - 1; i >= 0; i--) {
                const start = moment().subtract(i, 'months').startOf('month');
                const end = moment().subtract(i, 'months').endOf('month');

                let count = 0;
                getStayRecords.forEach(tenant => {
                    // Check current stay (if present and overlaps this month)
                    if (
                        tenant.currentStay &&
                        tenant.currentStay.propertyPpid === property.pgpalId &&
                        (!tenant.currentStay.assignedAt || moment(tenant.currentStay.assignedAt).isBefore(end)) &&
                        (tenant.status === 'active' || !tenant.currentStay.rentDueDate || moment(tenant.currentStay.rentDueDate).isAfter(start))
                    ) {
                        count++;
                        return;
                    }
                    // Check stayHistory
                    if (tenant.stayHistory && tenant.stayHistory.length) {
                        for (const stay of tenant.stayHistory) {
                            if (
                                stay.propertyId === property.pgpalId &&
                                moment(stay.from).isBefore(end) &&
                                (!stay.to || moment(stay.to).isAfter(start))
                            ) {
                                count++;
                                break;
                            }
                        }
                    }
                });

                trend.push({
                    month: start.format('MMM YYYY'),
                    occupancy: Math.round((count / totalBeds) * 100)
                });
            }

            res.status(200).json(trend);

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPlanInfo(req, res) {
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

        try {
            const userPlan = PlanHelper.getUserPlan(currentUser);
            const planSummary = PlanHelper.getPlanSummary(userPlan);

            res.status(200).json({
                success: true,
                planInfo: planSummary
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPlanUsage(req, res) {
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

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can view plan usage' });
        }

        try {
            const userPlan = PlanHelper.getUserPlan(currentUser);

            // Get current usage statistics
            const totalProperties = await Property.countDocuments({ ownerId: id });

            // Get detailed property stats
            const properties = await Property.find({ ownerId: id });
            let totalRooms = 0;
            let totalBeds = 0;
            let totalImages = 0;

            properties.forEach(property => {
                totalRooms += property.totalRooms || 0;
                totalBeds += property.totalBeds || 0;
                totalImages += property.images ? property.images.length : 0;
            });

            const usage = {
                properties: {
                    current: totalProperties,
                    limit: userPlan.limits.maxProperties,
                    unlimited: userPlan.limits.maxProperties === -1,
                    percentage: userPlan.limits.maxProperties === -1 ? 0 : Math.round((totalProperties / userPlan.limits.maxProperties) * 100)
                },
                rooms: {
                    current: totalRooms,
                    averagePerProperty: totalProperties > 0 ? Math.round(totalRooms / totalProperties) : 0,
                    limitPerProperty: userPlan.limits.maxRoomsPerProperty,
                    unlimited: userPlan.limits.maxRoomsPerProperty === -1
                },
                beds: {
                    current: totalBeds,
                    averagePerProperty: totalProperties > 0 ? Math.round(totalBeds / totalProperties) : 0,
                    limitPerProperty: userPlan.limits.maxBedsPerProperty,
                    unlimited: userPlan.limits.maxBedsPerProperty === -1
                },
                images: {
                    current: totalImages,
                    averagePerProperty: totalProperties > 0 ? Math.round(totalImages / totalProperties) : 0,
                    limitPerProperty: userPlan.limits.maxImagesPerProperty,
                    unlimited: userPlan.limits.maxImagesPerProperty === -1
                }
            };

            res.status(200).json({
                success: true,
                planType: userPlan.type,
                usage,
                features: userPlan.limits.features,
                restrictions: userPlan.limits.restrictions
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

};
