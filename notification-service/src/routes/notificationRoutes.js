const express = require('express');
const router = express();
const notificationController = require('../controllers/notificationController');

const restrictToInternal = (req, res, next) => {
    if (req.headers['x-internal-service']) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied: internal use only' });
};

router.post('/', notificationController.sendNotification);
router.post('/bulk', notificationController.sendBulkNotifications);
router.get('/', notificationController.getNotifications);
router.put('/:id/read', notificationController.markAsRead);
router.put('/:createdBy/read-all', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
