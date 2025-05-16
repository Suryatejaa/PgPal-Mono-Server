const Property = require('../models/propertyModel');
const Review = require('../models/reviewModel');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');


module.exports = {
    async addReview(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }
        try {
            const { rating, comment } = req.body;
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const newReview = await Review.create({
                propertyId: req.params.id,
                rating,
                comment,
                updatedBy: id,
                updatedByName: currentUser.data.user.username,
                updatedByRole: currentUser.data.user.role,
            });

            const propertyPpid = property.pgpalId;

            const title = 'New Review Added';
            const message = 'A new review has been submitted for your property.';
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


            res.status(200).json(newReview);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async editReview(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }
        try {
            const { rating, comment } = req.body;

            const review = await Review.findOne(
                { propertyId: req.params.id, _id: req.params.reviewId }
            );

            if (!review) {
                return res.status(404).json({ error: 'Review not found' });
            }

            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            if (review.updatedBy.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only edit your own reviews' });
            }

            review.rating = rating;
            review.comment = comment;
            review.updatedByName = currentUser.data.user.username;
            review.updatedByRole = currentUser.data.user.role;
            review.updatedAt = new Date();

            await review.save();

            const propertyPpid = property.pgpalId;

            const title = 'Review Updated';
            const message = 'A review has been modified for one of your properties.';
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


            res.status(200).json({ message: 'Review updated successfully', updated: review });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteReview(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }
        try {
            console.log(req.params.id);
            console.log(req.params.reviewId);

            const review = await Review.findOne(
                { propertyId: req.params.id, _id: req.params.reviewId }
            );

            if (!review) {
                return res.status(404).json({ error: 'Review not found' });
            }

            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            if (review.updatedBy.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only delete your own reviews' });
            }

            const propertyPpid = property.pgpalId;

            const title = 'Review Deleted';
            const message = 'A review has been removed from your property listing.';
            const type = 'alert';
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

            await Review.findByIdAndDelete(req.params.reviewId);

            res.status(200).json({ message: 'Review deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyReviews(req, res) {

        const cacheKey = '/api' + req.originalUrl; // Always add /api
        try {

            if (redisClient.isReady) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log('Returning cached username availability');
                    return res.status(200).send(JSON.parse(cached));
                }
            }

            const reviews = await Review.find({ propertyId: req.params.id });
            if (!reviews || reviews.length === 0) {
                return res.status(404).json({ error: 'No reviews found for this property' });
            }

            // Calculate the average rating
            const averageRating = reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length;

            const response = {
                reviews,
                averageRating
            };
            await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });


            res.status(200).json(response);

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};