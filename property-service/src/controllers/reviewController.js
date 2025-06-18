const Property = require('../models/propertyModel');
const Review = require('../models/reviewModel');
const CacheHelper = require('../utils/CacheHelper');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const { PLAN_LIMITS } = require('../middleware/planValidates.js');


module.exports = {
    async addReview(req, res) {
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
            const message = `${currentUser.data.user.username} has commented on ${property.name}: "${comment}" with a rating of ${rating}.`;
            const type = 'info';
            const method = ['in-app'];

            try {
                //console.log('Adding notification job to the queue...');

                await notificationQueue.add('notifications', {
                    ownerId: property.ownerId,
                    propertyPpid: propertyPpid,
                    audience: 'owner',
                    title,
                    message,
                    type,
                    method,
                    meta: { reviewId: newReview?._id || review?._id }, // add reviewId for context if available
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

            await invalidateCacheByPattern(`*${propertyPpid}*`);
            await invalidateCacheByPattern(`*${property._id}*`);
            await invalidateCacheByPattern(`*${req.params.id}*`);


            res.status(200).json(newReview);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async editReview(req, res) {
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
            const message = `${review.updatedByName} has updated their review for ${property.name}: "${comment}" with a rating of ${rating}.`;
            const type = 'info';
            const method = ['in-app'];


            try {
                // Notify the property owner
                await notificationQueue.add('notifications', {
                    ownerId: property.ownerId,
                    propertyPpid: propertyPpid,
                    audience: 'owner',
                    title,
                    message,
                    type,
                    method,
                    meta: { reviewId: review._id },
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });

                // Notify the user who raised the review (if not the current editor)
                if (review.updatedBy.toString() !== id) {
                    await notificationQueue.add('notifications', {
                        tenantId: review.updatedBy,
                        propertyPpid: propertyPpid,
                        audience: 'tenant',
                        title: 'Your Review Was Updated',
                        message: 'Your review for this property was updated by the property owner.',
                        type,
                        method,
                        meta: { reviewId: review._id },
                        createdBy: currentUser?.data?.user?.pgpalId || 'system'
                    }, {
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 3000
                        }
                    });
                }

                //console.log('Notification job added successfully');

            } catch (err) {
                console.error('Failed to queue notification:', err.message);
            }

            // ...existing code...

            await invalidateCacheByPattern(`*${propertyPpid}*`);
            await invalidateCacheByPattern(`*${property._id}*`);
            await invalidateCacheByPattern(`*${req.params.id}*`);


            res.status(200).json({ message: 'Review updated successfully', updated: review });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteReview(req, res) {
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
        const ppid = currentUser.data.user.pgpalId;

        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }
        try {
            //console.log(req.params.id);
            //console.log(req.params.reviewId);

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


            await invalidateCacheByPattern(`*${propertyPpid}*`);
            await invalidateCacheByPattern(`*${property._id}*`);
            await invalidateCacheByPattern(`*${req.params.id}*`);

            await Review.findByIdAndDelete(req.params.reviewId);

            res.status(200).json({ message: 'Review deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getPropertyReviews(req, res) {
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

            const reviews = await Review.find({ propertyId: req.params.id });
            if (!reviews || reviews.length === 0) {
                return res.status(404).json({ error: 'No reviews found for this property' });
            }

            // Apply plan-based review limits
            const userPlan = currentUser.data.user.currentPlan || { type: 'free' };
            const planType = userPlan.type || 'free';
            const planLimits = PLAN_LIMITS[planType];

            let limitedReviews = reviews;
            if (planLimits.maxReviewsDisplayed !== -1) {
                limitedReviews = reviews.slice(0, planLimits.maxReviewsDisplayed);
            }

            // Calculate the average rating
            const averageRating = reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length;

            const response = {
                reviews: limitedReviews,
                averageRating,
                totalReviews: reviews.length,
                displayedReviews: limitedReviews.length,
                planLimit: planLimits.maxReviewsDisplayed,
                upgradeRequired: planLimits.maxReviewsDisplayed !== -1 && reviews.length > planLimits.maxReviewsDisplayed
            };
            await CacheHelper.set(cacheKey, response, 600);

            res.status(200).json(response);

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};