const express = require('express');
const router = express();
const notificationController = require('../controllers/notificationController');

const restrictToInternal = (req, res, next) => {
    if (req.headers['x-internal-service']) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied: internal use only' });
};

// Specific routes first
router.post('/bulk', restrictToInternal, notificationController.sendBulkNotifications);
router.put('/read-all', notificationController.markAllAsRead);
router.delete('/delete-all', notificationController.deleteAllNotifications);

// General routes after
router.post('/', notificationController.sendNotification);
router.get('/', notificationController.getNotifications);
router.put('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;