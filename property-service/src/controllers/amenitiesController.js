const Property = require('../models/propertyModel');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern')
const notificationQueue = require('../utils/notificationQueue.js');

module.exports = {
    async getAmenities(req, res) {
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const cacheKey = req.originalUrl;

            const response = property.amenities || []
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async addAmenity(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId

        const validAmenities = [
            'Wifi',
            'Parking',
            'Pool',
            'Gym',
            'Air Conditioning',
            'Hotwater',
            'Kitchen',
            'Laundry',
            'TV',
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

        try {
            const { amenity } = req.body;
            const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
            const amenit = capitalize(amenity);

            if (!validAmenities.includes(amenit)) {
                return res.status(400).json({ error: `Invalid amenity. Allowed values are: ${validAmenities.join(', ')}` });
            }

            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const propertyPpid = property.pgpalId

            if (property.ownerId.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only add amenities to your own properties' });
            }
            if (!amenit) {
                return res.status(400).json({ error: 'Amenity is required' });
            }
            if (property.amenities.includes(amenit)) {
                return res.status(400).json({ error: 'Amenity already exists' });
            }
            await Property.findByIdAndUpdate(
                req.params.id,
                { $push: { amenities: amenit } },
                { new: true }
            );

            const title = 'Amenity Added';
            const message = 'A new amenity has been added to your property.';
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

            res.status(200).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteAmenity(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId
        const amenityName = req.params.amenityName.charAt(0).toUpperCase() + req.params.amenityName.slice(1).toLowerCase();

        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const propertyPpid = property.pgpalId

            if (property.ownerId.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only add amenities to your own properties' });
            }
            if (!property.amenities.includes(amenityName)) {
                return res.status(400).json({ error: 'Amenity does not exist' });
            }
            if (!amenityName) {
                return res.status(400).json({ error: 'Amenity is required' });
            }
            await Property.findByIdAndUpdate(
                req.params.id,
                { $pull: { amenities: amenityName } },
                { new: true }
            );

            const title = 'Amenity Removed';
            const message = `An amenity has been removed from your property.`;
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

            res.status(200).json({ message: 'Amenity deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

};