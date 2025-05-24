const notificationQueue = require('../queues/notificationQueue');
const Notification = require('../models/notificationModel');
const { getTenantConfirmation } = require('./internalApis');

exports.sendNotification = async (req, res) => {
    try {

        const currentUser = JSON.parse(req.headers['x-user']);
        const { tenantId, title, message, type, method } = req.body;

        if (!tenantId || !title || !message) {
            return res.status(400).json({ error: 'tenantId, propertyPpid, title, and message are required' });
        }

        const tenant = await getTenantConfirmation(tenantId, currentUser);
        const tenantConfirmation = tenant[0];
        //console.log(tenantConfirmation);
        if (!tenantConfirmation) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        if (tenantConfirmation.status !== 'active') {
            return res.status(403).json({ error: 'Tenant is not active' });
        }

        const propertyPpid = tenantConfirmation.currentStay.propertyPpid;

        const notification = await Notification.create({
            tenantId,
            propertyPpid,
            title,
            message,
            type: type || 'info',
            method: method || ['in-app'],
            createdBy: currentUser?.data?.user?.pgpalId || 'system',
        });

        res.status(201).json({ message: 'Notification sent', notification });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const { tenantId, ownerId, propertyPpid, status, unread, audience } = req.query;
        const filter = {};

        // Role-based filtering
        if (tenantId) {
            filter.tenantId = tenantId;
            filter.audience = { $in: ['tenant', 'all'] };
        } else if (ownerId) {
            filter.ownerId = ownerId;
            filter.audience = { $in: ['owner', 'all'] };
        }

        if (propertyPpid) filter.propertyPpid = propertyPpid;
        if (status) filter.status = status;
        if (unread === 'true') filter.isRead = false;
        if (audience) filter.audience = audience; // Optional override

        const notifications = await Notification.find(filter).sort({ createdAt: -1 });

        res.status(200).json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findByIdAndUpdate(
            id,
            { isRead: true, status: 'read' },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.status(200).json({ message: 'Notification marked as read', notification });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        const { tenantId, ownerId, propertyPpid, status, unread, audience } = req.query;
        const filter = {};

        // Role-based filtering
        if (tenantId) {
            filter.tenantId = tenantId;
            filter.audience = { $in: ['tenant', 'all'] };
        } else if (ownerId) {
            filter.ownerId = ownerId;
            filter.audience = { $in: ['owner', 'all'] };
        }

        if (propertyPpid) filter.propertyPpid = propertyPpid;
        if (status) filter.status = status;
        if (unread === 'true') filter.isRead = false;
        if (audience) filter.audience = audience; // Optional override

        const notifications = await Notification.updateMany(filter, { isRead: true, status: 'read' });
        if (!notifications) {
            return res.status(404).json({ error: 'No notifications found' });
        }
        res.status(200).json({ message: 'All notifications marked as read', notifications });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await Notification.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.status(200).json({ message: 'Notification deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteAllNotifications = async (req, res) => {
    try {
        const { tenantId, ownerId, propertyPpid, status, unread } = req.query;
        const filter = {};

        // Role-based filtering
        if (tenantId) {
            filter.tenantId = tenantId;
        } else if (ownerId) {
            filter.ownerId = ownerId;
        }

        if (propertyPpid) filter.propertyPpid = propertyPpid;
        if (status) filter.status = status;
        if (unread === 'true') filter.isRead = false;
        
        const deleted = await Notification.deleteMany(filter);

        if (!deleted) {
            return res.status(404).json({ error: 'No notifications found' });
        }

        res.status(200).json({ message: 'All notifications deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.sendBulkNotifications = async (req, res) => {
    try {
        const currentUser = JSON.parse(req.headers['x-user']);
        const createdBy = currentUser?.data?.user?.pgpalId || 'system';

        const { tenantIds, title, message, type, method } = req.body;

        if (!tenantIds || !Array.isArray(tenantIds) || tenantIds.length === 0) {
            return res.status(400).json({ error: 'tenantIds array is required' });
        }

        const validTenantIds = [];
        let propertyPpid = null;

        for (const tenantId of tenantIds) {
            // Fetch tenant confirmation for each tenant
            const tenantConfirmation = await getTenantConfirmation(tenantId, currentUser);
            if (!tenantConfirmation) continue;
            if (tenantConfirmation.status !== 'active') continue;

            if (!propertyPpid) {
                propertyPpid = tenantConfirmation.currentStay.propertyPpid;
            }

            validTenantIds.push(tenantId);
        }
        if (validTenantIds.length === 0) {
            return res.status(400).json({ error: 'No valid tenants to send notifications' });
        }


        await notificationQueue.add('send-bulk', {
            tenantIds: validTenantIds,
            propertyPpid,
            title,
            message,
            type,
            method,
            createdBy
        });

        res.status(202).json({ message: 'Notification queued for processing' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

