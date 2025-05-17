const Property = require('../models/propertyModel');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');

module.exports = {
    async getAmenities(req, res) {
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const cacheKey = '/api' + req.originalUrl; // Always add /api

            if (redisClient.isReady) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log('Returning cached username availability');
                    return res.status(200).send(JSON.parse(cached));
                }
            }

            const response = property.amenities || [];
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async addAmenity(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        const validAmenities = [
            'Wifi',
            'Parking',
            'Pool',
            'Gym',
            'Air Conditioning',
            'Hotwater',
            'Kitchen',
            'Laundry',
            'Tv',
            'Pet Friendly',
            'Breakfast',
            'Smoke Free',
            'Family Friendly',
            'Room Service',
            'Airport Shuttle',
            'Concierge Service',
            '24-Hour Front Desk',
            'Meeting Rooms',
            'Event Space',
            'Outdoor Space',
            'Garden',
            'Balcony',
            'Terrace',
            'Lift',
            'Lunch',
            'Dinner',
            'Pharmacy'
        ];
        function normalizeAmenity(str) {
            return str.trim().toLowerCase().replace(/\s+/g, '');
        }
        const validAmenitiesSet = new Set(validAmenities.map(normalizeAmenity));

        try {
            const { amenities } = req.body; // Expecting an array of amenities
            if (!amenities || !Array.isArray(amenities) || amenities.length === 0) {
                return res.status(400).json({ error: 'Amenities are required and must be an array' });
            }

            const capitalizedAmenities = amenities.map((amenity) =>
                amenity.charAt(0).toUpperCase() + amenity.slice(1).toLowerCase()
            );

            const invalidAmenities = amenities.filter(
                amenity => !validAmenitiesSet.has(normalizeAmenity(amenity))
            );if (invalidAmenities.length > 0) {
                return res.status(400).json({
                    error: `Invalid amenities: ${invalidAmenities.join(', ')}. Allowed values are: ${validAmenities.join(', ')}`
                });
            }

            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const propertyPpid = property.pgpalId;

            if (property.ownerId.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only add amenities to your own properties' });
            }

            const existingAmenities = property.amenities || [];
            const newAmenities = capitalizedAmenities.filter((amenity) => !existingAmenities.includes(amenity));

            if (newAmenities.length === 0) {
                return res.status(400).json({ error: 'All provided amenities already exist' });
            }

            await Property.findByIdAndUpdate(
                req.params.id,
                { $push: { amenities: { $each: newAmenities } } },
                { new: true }
            );

            const title = 'Amenities Added';
            const message = `New amenities have been added to your property: ${newAmenities.join(', ')}`;
            const type = 'info';
            const method = ['in-app'];

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
            await invalidateCacheByPattern(`*${req.params.id}*`);


            res.status(200).json({ message: `Amenities added successfully: ${newAmenities.join(', ')}` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteAmenity(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const propertyPpid = property.pgpalId;

            if (property.ownerId.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only delete amenities from your own properties' });
            }

            const { amenities } = req.body; // Expecting an array of amenities to delete
            if (!amenities || !Array.isArray(amenities) || amenities.length === 0) {
                return res.status(400).json({ error: 'Amenities are required and must be an array' });
            }

            // Capitalize amenities for consistency
            const capitalizedAmenities = amenities.map((amenity) =>
                amenity.charAt(0).toUpperCase() + amenity.slice(1).toLowerCase()
            );

            // Check if all amenities exist in the property
            const notFound = capitalizedAmenities.filter(a => !property.amenities.includes(a));
            if (notFound.length > 0) {
                return res.status(400).json({ error: `Amenities do not exist: ${notFound.join(', ')}` });
            }

            await Property.findByIdAndUpdate(
                req.params.id,
                { $pull: { amenities: { $in: capitalizedAmenities } } },
                { new: true }
            );

            const title = 'Amenities Removed';
            const message = `Amenities have been removed from your property: ${capitalizedAmenities.join(', ')}`;
            const type = 'alert';
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

            await invalidateCacheByPattern(`*${propertyPpid}*`);
            await invalidateCacheByPattern(`*${req.params.id}*`);

            res.status(200).json({ message: `Amenities deleted successfully: ${capitalizedAmenities.join(', ')}` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

};