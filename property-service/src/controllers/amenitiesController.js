const { json } = require('express');
const Property = require('../models/propertyModel');
const axios = require('axios');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern')


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

            await invalidateCacheByPattern(`*${propertyPpid}*`);

            res.status(200).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteAmenity(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
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

            await invalidateCacheByPattern(`*${propertyPpid}*`);

            res.status(200).json({ message: 'Amenity deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

};