const Complaint = require('../models/complainsModel');
const { generateRITM } = require('../utils/idGenerator');
const { getTenantConfirmation } = require('./internalApis');
const { getPropertyOwner } = require('./internalApis');
const redisClient = require('../utils/redis.js'); // Adjust the path as needed
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const { response } = require('express');
const notificationQueue = require('../utils/notificationQueue.js');

const complaintsMap = {
    Electrical: {
        name: 'Electrical',
        responseTime: '24 hours',
        priority: 'High',
    },
    Plumbing: {
        name: 'Plumbing',
        responseTime: '24 hours',
        priority: 'High',
    },
    Maintenance: {
        name: 'Maintenance',
        responseTime: '48 hours',
        priority: 'Medium',
    },
    Internet: {
        name: 'Internet',
        responseTime: '24 hours',
        priority: 'High',
    },
    Furniture: {
        name: 'Furniture',
        responseTime: '48 hours',
        priority: 'Medium',
    },
    Food: {
        name: 'Food',
        responseTime: '24 hours',
        priority: 'Medium',
    },
    Other: {
        name: 'Other',
        responseTime: 'N/A',
        priority: 'Low',
    }
};

module.exports = {
    async addComplaint(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']);
        const role = currentUser.data.user.role;
        const id = currentUser.data.user._id;
        const ppid = currentUser.data.user.pgpalId;

        if (role !== 'tenant') {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to add a complaint' });
        }

        let { tenantId, propertyId, complaintType, complaintOn, description } = req.body;

        if (!tenantId) tenantId = ppid;
        if (!propertyId || !complaintType || !description) {
            return res.status(400).json({ error: 'Property ID, complaint type, and description are required' });
        }

        const tenantConfirmation = await getTenantConfirmation(tenantId, currentUser);
        if (!tenantConfirmation) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        if (tenantConfirmation.status !== 'active') {
            return res.status(403).json({ error: 'Tenant is not active' });
        }
        if (propertyId !== tenantConfirmation.currentStay.propertyPpid) {
            return res.status(403).json({ error: 'Tenant is not staying in this property' });
        }

        const meta = complaintsMap[complaintType] || complaintsMap['Other'];

        if (meta) {
            complaintType = meta.name;

        }

        if (!complaintType) {
            return res.status(400).json({ error: 'Invalid complaint type' });
        }

        try {
            const complaint = await Complaint.create({
                complaintId: generateRITM(),
                tenantId,
                propertyId,
                complaintOn,
                complaintType,
                complaintMetadata: meta,
                status: 'Pending',
                createdBy: ppid,
                createdAt: Date.now(),
                description,
            });

            const title = 'New Complaint';
            const message = description;
            const type = 'complaint_update';
            const method = ["in-app", "email"];

            try {
                console.log('Adding notification job to the queue...');

                await notificationQueue.add('notifications', {
                    tenantIds: [tenantId],
                    propertyPpid: propertyId,
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

            await invalidateCacheByPattern(`*${propertyId}*`);
            await invalidateCacheByPattern(`*${tenantId}*`);

            res.status(201).json(complaint);
        } catch (error) {
            res.status(500).json({ error: 'Failed to add complaint' });
        }
    },

    async getComplaints(req, res) {
        console.log('called');
        try {

            const cacheKey = req.originalUrl;

            if (redisClient.isReady) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log('Returning cached username availability');
                    return res.status(200).send(JSON.parse(cached));
                }
            }

            const { propertyId, tenantId, status } = req.query;
            const filter = {};
            if (propertyId) filter.propertyId = propertyId;
            if (tenantId) filter.tenantId = tenantId;
            if (status) filter.status = status;

            const complaints = await Complaint.find(filter).sort({ createdAt: -1 });

            if (redisClient.isReady) {
                await redisClient.set(cacheKey, JSON.stringify(complaints), { EX: 60 });
            }

            res.status(200).json(complaints);
        } catch (error) {
            res.status(500).json({
                error: 'Failed to fetch complaints',
                err: error.message
            });
        }
    },

    async getComplaintById(req, res) {
        const cacheKey = req.originalUrl;
        try {

            if (redisClient.isReady) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log('Returning cached username availability');
                    return res.status(200).send(JSON.parse(cached));
                }
            }

            const complaint = await Complaint.findOne({ complaintId: req.params.id });
            if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

            if (redisClient.isReady) {
                await redisClient.set(cacheKey, JSON.stringify(complaint), { EX: 60 });
            }

            res.status(200).json(complaint);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch complaint' });
        }
    },

    async updateComplaint(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']);
        const ppid = currentUser.data.user.pgpalId;
        const id = currentUser.data.user._id;
        try {
            const complaint = await Complaint.findOne({ complaintId: req.params.id });
            if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

            const confirmOwner = await getPropertyOwner(complaint.propertyId, currentUser);
            if (!confirmOwner) {
                return res.status(404).json({ error: 'Property not found' });
            }

            if (complaint.tenantId !== ppid && confirmOwner.ownerId !== id) {
                return res.status(403).json({ error: 'Forbidden: You do not have permission to update this complaint' });
            }
            if (complaint.status !== 'Pending') {
                return res.status(403).json({ error: 'Forbidden: You cannot update a complaint that is not pending' });
            }

            if (req.body.status && req.body.status !== complaint.status) {
                if (req.body.status === 'Resolved' && !req.body.notes) {
                    return res.status(400).json({ error: 'Notes are required when resolving a complaint' });
                }

                req.body.resolvedAt = Date.now();
                req.body.resolvedBy = ppid;

                if (req.body.notes) {
                    complaint.notes.push({
                        message: req.body.notes,
                        by: ppid
                    });
                }
            }

            const updatedComplaint = await Complaint.findOneAndUpdate(
                { complaintId: req.params.id },
                { $set: { ...req.body, updatedAt: Date.now() } },
                { new: true }
            );

            if (!updatedComplaint) return res.status(404).json({ error: 'Complaint not found' });

            const title = 'Complaint Status Updated';
            const message = `Your complaint has been updated. Check the latest status for more details.`;
            const type = 'complaint_update';
            const method = ['in-app', 'email'];

            try {
                console.log('Adding notification job to the queue...');

                await notificationQueue.add('notifications', {
                    tenantIds: [ppid],
                    propertyPpid: complaint.propertyId,
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

            await invalidateCacheByPattern(`*${complaint.propertyId}*`);

            res.status(200).json(updatedComplaint);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update complaint' });
        }
    },

    async deleteComplaint(req, res) {
        const currentUser = JSON.parse(req.headers['x-user']);
        const ppid = currentUser.data.user.pgpalId;
        try {
            const complaint = await Complaint.findOne({ complaintId: req.params.id });
            if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

            const propertyId = complaint.propertyId;

            if (complaint.tenantId !== ppid) {
                return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this complaint' });
            }
            const deletedComplaint = await Complaint.findOneAndDelete({ complaintId: req.params.id });
            if (!deletedComplaint) return res.status(404).json({ error: 'Complaint not found' });

            const title = 'Complaint Removed';
            const message = `Your complaint has been removed from the system. If this was unexpected, please contact support.`;
            const type = 'alert';
            const method = ['in-app', 'email'];

            try {
                console.log('Adding notification job to the queue...');

                await notificationQueue.add('notifications', {
                    tenantIds: [ppid],
                    propertyPpid: propertyId,
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

            await invalidateCacheByPattern(`*${propertyId}*`);

            res.status(200).json({ message: 'Complaint deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete complaint', err: error.message });
        }
    },

    async getComplaintMetrics(req, res) {

        const cacheKey = req.originalUrl;

        try {

            const totalComplaints = await Complaint.countDocuments();
            const pendingComplaints = await Complaint.countDocuments({ status: 'Pending' });
            const resolvedComplaints = await Complaint.countDocuments({ status: 'Resolved' });

            const response = {
                totalComplaints,
                pendingComplaints,
                resolvedComplaints
            };

            if (redisClient.isReady) {
                await redisClient.set(cacheKey, JSON.stringify(response), { EX: 60 });
            }

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch complaint metrics' });
        }
    },

    async getComplaintMetricsByPropertyId(req, res) {
        try {
            const { propertyId } = req.params;
            const cacheKey = req.originalUrl;

            if (redisClient.isReady) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    console.log('Returning cached username availability');
                    return res.status(200).send(JSON.parse(cached));
                }
            }

            const totalComplaints = await Complaint.countDocuments({ propertyId });
            const pendingComplaints = await Complaint.countDocuments({ propertyId, status: 'Pending' });
            const resolvedComplaints = await Complaint.countDocuments({ propertyId, status: 'Resolved' });
            const closedComplaints = await Complaint.countDocuments({ propertyId, status: 'Closed' });

            const response = {
                propertyId,
                totalComplaints,
                pendingComplaints,
                resolvedComplaints,
                closedComplaints
            };

            if (redisClient.isReady) {
                await redisClient.set(cacheKey, JSON.stringify(response), { EX: 60 });
            }

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch complaint metrics for the property' });
        }
    }
};
