const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adaptiveRateLimit, rateLimiters } = require('../utils/rateLimiter');
const {
    validatePagination,
    validateRoomSearch,
    validateBulkUpdate,
    validateExport,
    validateActivityLogs
} = require('../utils/adminValidation');

// Apply rate limiting to all admin routes
router.use(adaptiveRateLimit);

// Dashboard Analytics Routes
router.get('/dashboard/overview', rateLimiters.dashboard, adminController.getDashboardOverview);
router.get('/dashboard/advanced', rateLimiters.dashboard, adminController.getAdvancedDashboard);
router.get('/dashboard/comprehensive', rateLimiters.dashboard, adminController.getComprehensiveDashboard);
router.get('/analytics/property', rateLimiters.analytics, adminController.getPropertyAnalytics);
router.get('/analytics/revenue', rateLimiters.analytics, adminController.getRevenueAnalytics);
router.get('/analytics/advanced', rateLimiters.analytics, adminController.getAdvancedAnalytics);
router.get('/analytics/insights', rateLimiters.analytics, adminController.getPerformanceInsights);
router.get('/analytics/forecast', rateLimiters.analytics, adminController.getOccupancyForecast);

// Room Management Routes
router.get('/rooms', validatePagination, validateRoomSearch, adminController.getAllRooms);
router.get('/rooms/search', validatePagination, validateRoomSearch, adminController.searchRooms);
router.put('/rooms/bulk-update', rateLimiters.bulkOperations, validateBulkUpdate, adminController.bulkUpdateRooms);

// Activity and Monitoring Routes
// router.get('/activity/logs', validatePagination, validateActivityLogs, adminController.getActivityLogs);
// router.get('/activity/user/:userId', adminController.getUserActivity);

// System Monitoring Routes
router.get('/system/health', adminController.getSystemHealth);

// Data Export Routes
router.get('/export', rateLimiters.exports, validateExport, adminController.exportData);
router.get('/export/data', rateLimiters.exports, validateExport, adminController.exportData);
router.get('/export/files', rateLimiters.dashboard, adminController.getExportFiles);
router.get('/export/files/:fileName', rateLimiters.exports, adminController.downloadExportFile);

// Notification Routes
router.post('/notifications/test', rateLimiters.dashboard, adminController.sendTestNotification);

// Scheduled Reports Routes
router.get('/reports/scheduled/status', rateLimiters.dashboard, adminController.getScheduledReportsStatus);
router.post('/reports/generate', adminController.generateManualReport);

module.exports = router;
