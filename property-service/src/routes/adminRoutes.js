// filepath: d:\project\PgPaal\PGserver\property-service\src\routes\adminRoutes.js
// Admin Routes - Complete Admin Dashboard API endpoints
const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { validateAdminAccess, adminRateLimit, auditLogger } = require('../middleware/adminAuth');

// Debug endpoint (no middleware)
router.get('/test', (req, res) => {
    res.json({ message: 'Admin routes are working!', timestamp: new Date() });
});

// Test endpoint with headers check
router.get('/test-auth', (req, res) => {
    res.json({
        message: 'Auth test endpoint',
        headers: req.headers,
        timestamp: new Date()
    });
});

// Apply admin authentication, rate limiting, and audit logging to protected routes
router.use('/dashboard', validateAdminAccess('admin'));
router.use('/properties', validateAdminAccess('admin'));
router.use('/users', validateAdminAccess('admin'));
router.use('/analytics', validateAdminAccess('admin'));
router.use('/bulk-operations', validateAdminAccess('admin'));
router.use('/maintenance', validateAdminAccess('super_admin'));
router.use('/notifications', validateAdminAccess('super_admin'));
router.use('/export', validateAdminAccess('admin'));

// ====================================
// DASHBOARD OVERVIEW
// ====================================
router.get('/dashboard/overview', AdminController.getDashboardOverview);

// ====================================
// PROPERTY MANAGEMENT
// ====================================
// Advanced property listing with filters, pagination, and search
router.get('/properties', AdminController.getAllPropertiesAdmin);

// Get property details with admin insights
router.get('/properties/:id', AdminController.getPropertyDetailsAdmin);

// Force delete property (permanent removal with cleanup)
router.delete('/properties/:id/force-delete', validateAdminAccess('super_admin'), AdminController.forceDeleteProperty);

// Suspend/reactivate property
router.patch('/properties/:id/toggle-status', AdminController.togglePropertyStatus);

// ====================================
// USER MANAGEMENT
// ====================================
// Get user list with advanced filtering
router.get('/users', AdminController.getAllUsersAdmin);

// Get user details with property statistics
router.get('/users/:id', AdminController.getUserDetailsAdmin);

// Suspend/reactivate user (affects all their properties)
router.patch('/users/:id/toggle-status', validateAdminAccess('super_admin'), AdminController.toggleUserStatus);

// ====================================
// SYSTEM ANALYTICS
// ====================================
// Comprehensive system analytics with customizable time periods
router.get('/analytics', AdminController.getSystemAnalytics);

// ====================================
// BULK OPERATIONS
// ====================================
// Bulk operations endpoint (handles multiple operation types)
router.post('/bulk-operations', AdminController.bulkOperations);

// ====================================
// SYSTEM MAINTENANCE
// ====================================
// System maintenance operations
router.post('/maintenance', validateAdminAccess('super_admin'), AdminController.systemMaintenance);

// ====================================
// NOTIFICATION MANAGEMENT
// ====================================
// Send system-wide notifications
router.post('/notifications/send', validateAdminAccess('super_admin'), AdminController.sendSystemNotification);

// ====================================
// DATA EXPORT
// ====================================
// Export data endpoint (handles multiple export types)
router.get('/export', AdminController.exportData);

module.exports = router;
