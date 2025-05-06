const Property = require('../models/propertyModel');
const Rule = require('../models/ruleModel');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');

module.exports = {
    async addRule(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const role = currentUser.data.user.role;
        const ppid = currentUser.data.user.pgpalId;

        if (role !== 'owner') {
            return res.status(403).json({ error: 'Forbidden: Only owners can add rules' });
        }
        try {
            const { rule } = req.body;
            const property = await Property.findById(req.params.id);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only add rules to your own properties' });
            }
            if (!rule) {
                return res.status(400).json({ error: 'Rule is required' });
            }
            const existingRule = await Rule.findOne({ propertyId: req.params.id, rule });
            if (existingRule) {
                return res.status(400).json({ error: 'Rule already exists' });
            }

            // Create a new rule
            const newRule = await Rule.create({
                propertyId: req.params.id,
                rule,
                updatedBy: currentUser.data.user._id,
                updatedByName: currentUser.data.user.username,
                updatedByRole: currentUser.data.user.role,
                updatedAt: new Date()
            });

            const propertyPpid = property.pgpalId;

            const title = 'New Rule Added';
            const message = 'A new rule has been added to the property. Make sure everyone is informed.';
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

            res.status(201).json(newRule);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async getRules(req, res) {
        try {
            const rules = await Rule.find({ propertyId: req.params.id });
            if (!rules || rules.length === 0) {
                return res.status(404).json({ error: 'Rules not found' });
            }

            const cacheKey = req.originalUrl;
            await redisClient.set(cacheKey, JSON.stringify(rules), { EX: 300 });

            res.status(200).json(rules);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    async deleteRule(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']) || {};
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        if (!id) {
            return res.status(401).json({ error: 'Unauthorized: Missing userId' });
        }

        try {
            const rule = await Rule.findOne(
                { propertyId: req.params.id, _id: req.params.ruleId } // Find the rule by propertyId and ruleId
            );
            if (!rule) {
                return res.status(404).json({ error: 'Rule not found' });
            }
            const property = await Property.findById(rule.propertyId);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (property.ownerId.toString() !== id) {
                return res.status(403).json({ error: 'Forbidden: You can only delete rules from your own properties' });
            }
            await Rule.findByIdAndDelete(req.params.ruleId); // Delete the rule by ruleId

            const propertyPpid = property.pgpalId;

            const title = 'Rule Removed';
            const message = 'A property rule has been deleted.';
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

            res.status(200).json({ message: 'Rule deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

};