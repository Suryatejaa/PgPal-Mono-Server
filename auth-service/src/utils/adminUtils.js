const User = require('../models/userModel');
const GoogleUser = require('../models/googleModel');
const CacheHelper = require('./CacheHelper');
const invalidateCacheByPattern = require('./invalidateCachedByPattern');
const notificationQueue = require('./notificationQueue');
const crypto = require('node:crypto');

/**
 * Advanced Admin Utilities
 */

/**
 * Generate secure admin tokens
 */
const generateSecureToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Clean up inactive users (users who registered but never verified)
 */
const cleanupInactiveUsers = async (daysOld = 30) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await User.deleteMany({
            isVerified: false,
            createdAt: { $lt: cutoffDate }
        });

        return {
            success: true,
            deletedCount: result.deletedCount,
            message: `Cleaned up ${result.deletedCount} inactive users`
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Archive old user data
 */
const archiveOldUsers = async (daysOld = 365) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const oldUsers = await User.find({
            updatedAt: { $lt: cutoffDate },
            isVerified: false
        }).lean();

        // In a real implementation, you would move these to an archive collection
        // For now, just return the count

        return {
            success: true,
            candidatesForArchiving: oldUsers.length,
            message: `Found ${oldUsers.length} users eligible for archiving`
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Generate comprehensive system report
 */
const generateSystemReport = async () => {
    try {
        const [
            userStats,
            systemHealth,
            cacheStatus,
            recentActivity
        ] = await Promise.all([
            getUserStatistics(),
            getSystemHealth(),
            getCacheHealth(),
            getRecentActivity()
        ]);

        return {
            success: true,
            report: {
                generatedAt: new Date(),
                userStats,
                systemHealth,
                cacheStatus,
                recentActivity
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Get detailed user statistics
 */
const getUserStatistics = async () => {
    try {
        const [
            totalUsers,
            verifiedUsers,
            activeUsers,
            roleDistribution,
            subscriptionDistribution,
            recentRegistrations
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isVerified: true }),
            User.countDocuments({
                updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }),
            User.aggregate([
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ]),
            User.aggregate([
                { $group: { _id: '$subscriptionStatus.plan', count: { $sum: 1 } } }
            ]),
            User.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            })
        ]);

        return {
            totalUsers,
            verifiedUsers,
            activeUsers,
            verificationRate: (verifiedUsers / totalUsers * 100).toFixed(2),
            roleDistribution,
            subscriptionDistribution,
            recentRegistrations
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Get system health information
 */
const getSystemHealth = async () => {
    try {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        return {
            uptime: {
                seconds: uptime,
                formatted: formatUptime(uptime)
            },
            memory: {
                used: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
                total: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
                external: (memoryUsage.external / 1024 / 1024).toFixed(2) + ' MB'
            },
            node: {
                version: process.version,
                platform: process.platform,
                pid: process.pid
            }
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Get cache health status
 */
const getCacheHealth = async () => {
    try {
        const status = CacheHelper.getStatus();

        return {
            redis: status,
            isOperational: status.ready
        };
    } catch (error) {
        return {
            redis: { status: 'error', error: error.message },
            isOperational: false
        };
    }
};

/**
 * Get recent activity summary
 */
const getRecentActivity = async () => {
    try {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [
            newUsersToday,
            newUsersWeek,
            verifiedToday
        ] = await Promise.all([
            User.countDocuments({ createdAt: { $gte: last24Hours } }),
            User.countDocuments({ createdAt: { $gte: last7Days } }),
            User.countDocuments({
                isVerified: true,
                updatedAt: { $gte: last24Hours }
            })
        ]);

        return {
            last24Hours: {
                newUsers: newUsersToday,
                verifications: verifiedToday
            },
            last7Days: {
                newUsers: newUsersWeek
            }
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Format uptime in a human-readable format
 */
const formatUptime = (seconds) => {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${days}d ${hours}h ${minutes}m ${secs}s`;
};

/**
 * Bulk email verification
 */
const bulkEmailVerification = async (userIds) => {
    try {
        const result = await User.updateMany(
            { _id: { $in: userIds } },
            { isVerified: true, emailVerifiedAt: new Date() }
        );

        // Invalidate caches
        await invalidateCacheByPattern('*admin_dashboard_stats*');

        return {
            success: true,
            modifiedCount: result.modifiedCount,
            message: `Verified ${result.modifiedCount} users`
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Send system maintenance notification to all users
 */
const sendMaintenanceNotification = async (message, scheduledTime) => {
    try {
        const users = await User.find({}, 'pgpalId role').lean();

        const notifications = users.map(user => ({
            [user.role === 'tenant' ? 'tenantId' : 'ownerId']: user.role === 'tenant' ? user.pgpalId : user._id,
            audience: user.role,
            title: 'Scheduled Maintenance',
            message: `${message} Scheduled for: ${scheduledTime}`,
            type: 'warning',
            method: ['in-app', 'email'],
            createdBy: 'system'
        }));

        // Queue all notifications
        await Promise.all(
            notifications.map(notification =>
                notificationQueue.add('notifications', notification, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                })
            )
        );

        return {
            success: true,
            notificationsSent: notifications.length,
            message: `Maintenance notification sent to ${notifications.length} users`
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Generate audit report for admin actions
 */
const generateAuditReport = async (startDate, endDate) => {
    try {
        // This would require an audit log collection
        // For now, return a placeholder structure

        return {
            success: true,
            report: {
                period: { startDate, endDate },
                adminActions: [],
                userChanges: [],
                systemEvents: [],
                summary: {
                    totalActions: 0,
                    uniqueAdmins: 0,
                    criticalActions: 0
                }
            },
            message: 'Audit logging needs to be implemented for detailed reports'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Database integrity check
 */
const checkDatabaseIntegrity = async () => {
    try {
        const issues = [];

        // Check for orphaned records
        const usersWithoutPgpalId = await User.countDocuments({ pgpalId: { $exists: false } });
        if (usersWithoutPgpalId > 0) {
            issues.push(`${usersWithoutPgpalId} users without pgpalId`);
        }

        // Check for duplicate emails
        const duplicateEmails = await User.aggregate([
            { $group: { _id: '$email', count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } }
        ]);
        if (duplicateEmails.length > 0) {
            issues.push(`${duplicateEmails.length} duplicate email addresses found`);
        }

        // Check for invalid phone numbers
        const invalidPhones = await User.countDocuments({
            phoneNumber: { $not: /^\d{10}$/ }
        });
        if (invalidPhones > 0) {
            issues.push(`${invalidPhones} users with invalid phone numbers`);
        }

        return {
            success: true,
            integrity: {
                issues: issues.length,
                problems: issues,
                status: issues.length === 0 ? 'healthy' : 'needs attention'
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    generateSecureToken,
    cleanupInactiveUsers,
    archiveOldUsers,
    generateSystemReport,
    getUserStatistics,
    getSystemHealth,
    getCacheHealth,
    getRecentActivity,
    formatUptime,
    bulkEmailVerification,
    sendMaintenanceNotification,
    generateAuditReport,
    checkDatabaseIntegrity
};
