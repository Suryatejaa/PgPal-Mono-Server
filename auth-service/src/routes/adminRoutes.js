const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const {
    adminAuthMiddleware,
    superAdminMiddleware,
    requirePermissions,
    auditLogger
} = require('../utils/adminMiddleware');
const { updateUserValidation } = require('../utils/validateRequest');
const {
    validateAdminCreation,
    validateBulkOperation,
    validateBulkNotification,
    validateCacheManagement,
    validateAdminUserUpdate,
    validatePagination,
    validateUserFilters
} = require('../utils/adminValidation');

// Admin Authentication Routes
router.post('/auth/create-admin',
    superAdminMiddleware,
    validateAdminCreation,
    auditLogger('create_admin_user'),
    adminController.createAdminUser
);

// Dashboard & Analytics Routes
router.get('/dashboard/stats',
    adminAuthMiddleware,
    adminController.getDashboardStats
);

router.get('/analytics/registration-trends',
    adminAuthMiddleware,
    adminController.getUserRegistrationTrends
);

// User Management Routes
router.get('/users',
    adminAuthMiddleware,
    validatePagination,
    validateUserFilters,
    auditLogger('get_all_users'),
    adminController.getAllUsers
);

router.get('/users/:userId',
    adminAuthMiddleware,
    auditLogger('get_user_details'),
    adminController.getUserDetails
);

router.put('/users/:userId',
    adminAuthMiddleware,
    validateAdminUserUpdate,
    auditLogger('update_user'),
    adminController.updateUser
);

router.delete('/users/:userId',
    adminAuthMiddleware,
    auditLogger('delete_user'),
    adminController.deleteUser
);

// Bulk Operations Routes
router.post('/users/bulk',
    adminAuthMiddleware,
    validateBulkOperation,
    auditLogger('bulk_user_operations'),
    adminController.bulkUserOperations
);

// System Monitoring Routes
router.get('/system/health',
    adminAuthMiddleware,
    adminController.getSystemHealth
);

// Cache Management Routes
router.post('/cache/manage',
    adminAuthMiddleware,
    validateCacheManagement,
    auditLogger('manage_cache'),
    adminController.manageCaches
);

// Notification Management Routes
router.post('/notifications/bulk-send',
    adminAuthMiddleware,
    validateBulkNotification,
    auditLogger('send_bulk_notification'),
    adminController.sendBulkNotification
);

// Data Export Routes
router.get('/export/users',
    adminAuthMiddleware,
    auditLogger('export_user_data'),
    adminController.exportUserData
);

router.post('/suspend-user/:userId',
    adminAuthMiddleware,
    auditLogger('suspend_user'),
    adminController.suspendUser
); 

router.post('/unsuspend-user/:userId',
    adminAuthMiddleware,
    auditLogger('unsuspend_user'),
    adminController.removeSuspension
);

// Advanced System Management Routes
router.get('/system/report',
    adminAuthMiddleware,
    async (req, res) => {
        try {
            const { generateSystemReport } = require('../utils/adminUtils');
            const result = await generateSystemReport();

            if (result.success) {
                res.status(200).json({
                    success: true,
                    data: result.report
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to generate system report',
                    error: result.error
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to generate system report',
                error: error.message
            });
        }
    }
);

router.post('/system/cleanup',
    superAdminMiddleware,
    auditLogger('cleanup_inactive_users'),
    async (req, res) => {
        try {
            const { days = 30 } = req.body;
            const { cleanupInactiveUsers } = require('../utils/adminUtils');
            const result = await cleanupInactiveUsers(days);

            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Cleanup operation failed',
                error: error.message
            });
        }
    }
);

router.get('/system/integrity-check',
    adminAuthMiddleware,
    async (req, res) => {
        try {
            const { checkDatabaseIntegrity } = require('../utils/adminUtils');
            const result = await checkDatabaseIntegrity();

            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Integrity check failed',
                error: error.message
            });
        }
    }
);

router.post('/notifications/maintenance',
    superAdminMiddleware,
    auditLogger('send_maintenance_notification'),
    async (req, res) => {
        try {
            const { message, scheduledTime } = req.body;

            if (!message || !scheduledTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Message and scheduled time are required'
                });
            }

            const { sendMaintenanceNotification } = require('../utils/adminUtils');
            const result = await sendMaintenanceNotification(message, scheduledTime);

            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to send maintenance notification',
                error: error.message
            });
        }
    }
);

// Security & Access Control Routes
router.post('/security/revoke-tokens',
    superAdminMiddleware,
    auditLogger('revoke_user_tokens'),
    async (req, res) => {
        try {
            const { userIds } = req.body;

            if (!userIds || !Array.isArray(userIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'User IDs array is required'
                });
            }

            const User = require('../models/userModel');
            const result = await User.updateMany(
                { _id: { $in: userIds } },
                { refreshToken: null }
            );

            res.status(200).json({
                success: true,
                message: 'Tokens revoked successfully',
                data: { modifiedCount: result.modifiedCount }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to revoke tokens',
                error: error.message
            });
        }
    }
);

router.post('/security/force-password-reset',
    superAdminMiddleware,
    auditLogger('force_password_reset'),
    async (req, res) => {
        try {
            const { userIds } = req.body;

            if (!userIds || !Array.isArray(userIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'User IDs array is required'
                });
            }

            const User = require('../models/userModel');
            const crypto = require('crypto');

            // Generate password reset tokens for all users
            const resetTokens = userIds.map(() => crypto.randomBytes(32).toString('hex'));

            const updatePromises = userIds.map((userId, index) =>
                User.findByIdAndUpdate(userId, {
                    passwordResetToken: resetTokens[index],
                    refreshToken: null // Also revoke refresh token
                })
            );

            await Promise.all(updatePromises);

            res.status(200).json({
                success: true,
                message: 'Password reset forced for selected users',
                data: { affectedUsers: userIds.length }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to force password reset',
                error: error.message
            });
        }
    }
);

// Advanced Analytics Routes
router.get('/analytics/user-activity',
    adminAuthMiddleware,
    async (req, res) => {
        try {
            const { period = '7d' } = req.query;

            let days = 7;
            if (period === '30d') days = 30;
            if (period === '90d') days = 90;

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const User = require('../models/userModel');

            const [
                loginActivity,
                registrationActivity,
                subscriptionActivity
            ] = await Promise.all([
                // This would require a login activity collection
                // For now, return mock data or implement based on your needs
                Promise.resolve([]),

                User.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: startDate }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    {
                        $sort: { '_id.date': 1 }
                    }
                ]),

                User.aggregate([
                    {
                        $match: {
                            'subscriptionStatus.plan': { $ne: 'free' }
                        }
                    },
                    {
                        $group: {
                            _id: '$subscriptionStatus.plan',
                            count: { $sum: 1 }
                        }
                    }
                ])
            ]);

            res.status(200).json({
                success: true,
                data: {
                    loginActivity,
                    registrationActivity,
                    subscriptionActivity
                }
            });
        } catch (error) {
            console.error('Error fetching user activity:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch user activity',
                error: error.message
            });
        }
    }
);

// Database Operations Routes
router.post('/database/optimize',
    superAdminMiddleware,
    auditLogger('optimize_database'),
    async (req, res) => {
        try {
            const mongoose = require('mongoose');

            // Run database optimization tasks
            const collections = ['users', 'googleusers'];
            const results = {};

            for (const collectionName of collections) {
                try {
                    const collection = mongoose.connection.db.collection(collectionName);
                    const stats = await collection.stats();
                    results[collectionName] = {
                        documents: stats.count,
                        avgObjectSize: stats.avgObjSize,
                        totalSize: stats.size
                    };
                } catch (error) {
                    results[collectionName] = { error: error.message };
                }
            }

            res.status(200).json({
                success: true,
                message: 'Database optimization completed',
                data: results
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Database optimization failed',
                error: error.message
            });
        }
    }
);

// Configuration Management Routes
router.get('/config/system',
    adminAuthMiddleware,
    async (req, res) => {
        try {
            const config = {
                nodeVersion: process.version,
                environment: process.env.NODE_ENV || 'development',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform,
                features: {
                    redis: !!process.env.REDIS,
                    email: !!(process.env.EMAIL && process.env.EMAIL_PASSWORD),
                    google_auth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
                }
            };

            res.status(200).json({
                success: true,
                data: config
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to fetch system configuration',
                error: error.message
            });
        }
    }
);

// Test admin authentication endpoint
router.get('/test',
    adminAuthMiddleware,
    (req, res) => {
        res.status(200).json({
            success: true,
            message: 'Admin authentication successful',
            admin: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email,
                role: req.user.role
            }
        });
    }
);

module.exports = router;
