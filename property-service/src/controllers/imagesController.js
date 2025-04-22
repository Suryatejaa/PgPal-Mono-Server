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
    async uploadImages(req, res) {
        try {
            const images = req.files.map(file => file.path);
            const property = await Property.findByIdAndUpdate(
                req.params.id,
                { $push: { images: { $each: images } } },
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