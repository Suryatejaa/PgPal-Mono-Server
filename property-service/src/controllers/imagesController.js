const { json } = require('express');
const Property = require('../models/propertyModel');
const { PLAN_LIMITS, getSuggestedPlan } = require('../middleware/planValidates.js');
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
    async uploadImages(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        if (!currentUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can upload images' });
        }

        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only upload images to your own properties' });
            }

            // Check plan limits for images per property
            const userPlan = currentUser.data.user.currentPlan || { type: 'free' };
            const planType = userPlan.type || 'free';
            const planLimits = PLAN_LIMITS[planType];

            const currentImageCount = property.images ? property.images.length : 0;
            const newImagesCount = req.files ? req.files.length : 0;
            const totalAfterUpload = currentImageCount + newImagesCount;

            if (planLimits.maxImagesPerProperty !== -1 && totalAfterUpload > planLimits.maxImagesPerProperty) {
                return res.status(403).json({
                    error: `Image limit reached. Your ${planType} plan allows ${planLimits.maxImagesPerProperty} images per property.`,
                    currentCount: currentImageCount,
                    maxAllowed: planLimits.maxImagesPerProperty,
                    upgradeRequired: true,
                    suggestedPlan: getSuggestedPlan(totalAfterUpload)
                });
            }

            const images = req.files.map(file => file.path);
            const updatedProperty = await Property.findByIdAndUpdate(
                req.params.id,
                { $push: { images: { $each: images } } },
                { new: true }
            );

            res.status(200).json(updatedProperty);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteImage(req, res) {
        try {
            const property = await Property.findByIdAndUpdate(
                req.params.id,
                { $pull: { images: { _id: req.params.imageId } } },
                { new: true }
            );
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            res.status(200).json({ message: 'Image deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getImages(req, res) {
        try {
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            res.status(200).json(property.images);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async updateImage(req, res) {
        try {
            const property = await Property.findByIdAndUpdate(
                req.params.id,
                { $set: { 'images.$[elem].url': req.body.url } },
                { arrayFilters: [{ 'elem._id': req.params.imageId }], new: true }
            );
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            res.status(200).json(property);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
};