const User = require('../models/userModel');
const GoogleUser = require('../models/googleModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const CacheHelper = require('../utils/CacheHelper');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue');
const sendOtpEmail = require('../utils/sendOtpEmail');
const { generatePPT, generatePPO } = require('../utils/idGenerator');

/**
 * Admin Dashboard Analytics
 */
const getDashboardStats = async (req, res) => {
    try {
        const cacheKey = 'admin_dashboard_stats';

        // Try to get from cache first
        let stats = await CacheHelper.get(cacheKey);

        if (!stats) {
            // Parallel queries for better performance
            const [
                totalUsers,
                totalOwners,
                totalTenants,
                verifiedUsers,
                unverifiedUsers,
                recentUsers,
                googleUsers,
                usersInTrial,
                activeSubscriptions,
                expiredSubscriptions
            ] = await Promise.all([
                User.countDocuments(),
                User.countDocuments({ role: 'owner' }),
                User.countDocuments({ role: 'tenant' }),
                User.countDocuments({ isVerified: true }),
                User.countDocuments({ isVerified: false }),
                User.countDocuments({
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }),
                GoogleUser.countDocuments(),
                User.countDocuments({ isInTrialPeriod: true }),
                User.countDocuments({ 'subscriptionStatus.status': 'active' }),
                User.countDocuments({ 'subscriptionStatus.status': 'expired' })
            ]);

            stats = {
                users: {
                    total: totalUsers,
                    owners: totalOwners,
                    tenants: totalTenants,
                    verified: verifiedUsers,
                    unverified: unverifiedUsers,
                    recentSignups: recentUsers,
                    googleUsers: googleUsers
                },
                subscriptions: {
                    trial: usersInTrial,
                    active: activeSubscriptions,
                    expired: expiredSubscriptions
                },
                timestamp: new Date()
            };

            // Cache for 5 minutes
            await CacheHelper.set(cacheKey, stats, 300);
        }

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
};

/**
 * User Management - Get All Users with Pagination and Filters
 */
const getAllUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            role,
            verified,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            subscriptionStatus
        } = req.query;

        const query = {};

        // Build filter query
        if (role) query.role = role;
        if (verified !== undefined) query.isVerified = verified === 'true';
        if (subscriptionStatus) query['subscriptionStatus.status'] = subscriptionStatus;

        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } },
                { pgpalId: { $regex: search, $options: 'i' } }
            ];
        }

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
            select: '-password -refreshToken -passwordResetToken -otp'
        };

        const users = await User.find(query)
            .select(options.select)
            .sort(options.sort)
            .limit(options.limit * 1)
            .skip((options.page - 1) * options.limit)
            .lean();

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    currentPage: options.page,
                    totalPages: Math.ceil(total / options.limit),
                    totalUsers: total,
                    hasNext: options.page < Math.ceil(total / options.limit),
                    hasPrev: options.page > 1
                }
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
};

/**
 * User Management - Get User Details
 */
const getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId)
            .select('-password -refreshToken -passwordResetToken -otp')
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user details',
            error: error.message
        });
    }
};

/**
 * User Management - Update User
 */
const updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;

        // Remove sensitive fields that shouldn't be updated directly
        delete updates.password;
        delete updates.refreshToken;
        delete updates.passwordResetToken;
        delete updates.otp;

        const user = await User.findByIdAndUpdate(
            userId,
            { ...updates, updatedAt: new Date() },
            { new: true, runValidators: true }
        ).select('-password -refreshToken -passwordResetToken -otp');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Invalidate relevant caches
        await invalidateCacheByPattern('*admin_dashboard_stats*');
        await invalidateCacheByPattern('*all_usernames*');
        await invalidateCacheByPattern('*all_emails*');
        await invalidateCacheByPattern('*all_phone_numbers*');

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: user
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
    }
};

/**
 * User Management - Delete User
 */
const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Store user data for audit trail
        const deletedUserData = {
            ...user.toObject(),
            deletedBy: req.user._id,
            deletedAt: new Date(),
            deletionReason: reason || 'Admin deletion'
        };

        await User.findByIdAndDelete(userId);

        // Invalidate caches
        await invalidateCacheByPattern('*admin_dashboard_stats*');
        await invalidateCacheByPattern('*all_usernames*');
        await invalidateCacheByPattern('*all_emails*');
        await invalidateCacheByPattern('*all_phone_numbers*');

        // Log deletion activity (you might want to store this in a separate audit collection)
        console.log('User deleted:', deletedUserData);

        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: error.message
        });
    }
};

/**
 * User Management - Bulk Operations
 */
const bulkUserOperations = async (req, res) => {
    try {
        const { operation, userIds, data } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'User IDs array is required'
            });
        }

        let result = {};

        console.log('Bulk operation:', operation, 'for user IDs:', userIds);

        switch (operation) {
            case 'verify':
                result = await User.updateMany(
                    { _id: { $in: userIds } },
                    { isVerified: true }
                );
                break;

            case 'unverify':
                result = await User.updateMany(
                    { _id: { $in: userIds } },
                    { isVerified: false }
                );
                break;

            case 'delete':
                result = await User.deleteMany({ _id: { $in: userIds } });
                break;

            case 'suspend':
                result = await User.updateMany(
                    { _id: { $in: userIds } },
                    { isSuspended: true }
                );
                break;

            case 'unsuspend':
                result = await User.updateMany(
                    { _id: { $in: userIds } },
                    { isSuspended: false }
                );
                break;

            case 'update_subscription':
                if (!data.subscriptionStatus) {
                    return res.status(400).json({
                        success: false,
                        message: 'Subscription status data is required'
                    });
                }
                result = await User.updateMany(
                    { _id: { $in: userIds } },
                    { subscriptionStatus: data.subscriptionStatus }
                );
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid operation'
                });
        }

        // Invalidate caches
        await invalidateCacheByPattern('*admin_dashboard_stats*');

        res.status(200).json({
            success: true,
            message: `Bulk ${operation} completed successfully`,
            data: {
                modifiedCount: result.modifiedCount || result.deletedCount,
                matchedCount: result.matchedCount || userIds.length
            }
        });
    } catch (error) {
        console.error('Error in bulk operation:', error);
        res.status(500).json({
            success: false,
            message: 'Bulk operation failed',
            error: error.message
        });
    }
};

/**
 * System Monitoring - Get System Health
 */
const getSystemHealth = async (req, res) => {
    try {
        const cacheKey = 'system_health';
        let health = await CacheHelper.get(cacheKey);

        if (!health) {
            const dbStatus = await checkDatabaseConnection();
            const redisStatus = CacheHelper.getStatus();

            health = {
                database: dbStatus,
                redis: redisStatus,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date()
            };

            // Cache for 1 minute
            await CacheHelper.set(cacheKey, health, 60);
        }

        res.status(200).json({
            success: true,
            data: health
        });
    } catch (error) {
        console.error('Error checking system health:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check system health',
            error: error.message
        });
    }
};

const checkDatabaseConnection = async () => {
    try {
        await User.findOne().limit(1);
        return { status: 'connected', message: 'Database connection is healthy' };
    } catch (error) {
        return { status: 'disconnected', message: error.message };
    }
};

/**
 * Analytics - User Registration Trends
 */
const getUserRegistrationTrends = async (req, res) => {
    try {
        const { period = '7d' } = req.query;

        let days = 7;
        if (period === '30d') days = 30;
        if (period === '90d') days = 90;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const trends = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        role: '$role'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.date': 1 }
            }
        ]);

        res.status(200).json({
            success: true,
            data: trends
        });
    } catch (error) {
        console.error('Error fetching registration trends:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch registration trends',
            error: error.message
        });
    }
};

/**
 * Authentication Management - Create Admin User
 */
const createAdminUser = async (req, res) => {
    try {
        const { username, email, phoneNumber, password, gender = 'other' } = req.body;

        // Check if admin user already exists
        const existingAdmin = await User.findOne({
            $or: [
                { email },
                { phoneNumber },
                { username }
            ],
            role: 'admin'
        });

        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Admin user with this email, phone, or username already exists'
            });
        }

        const adminUser = new User({
            username: username.toLowerCase(),
            email,
            phoneNumber,
            gender,
            role: 'admin',
            password,
            isVerified: true,
            pgpalId: `PPA${Math.floor(100000 + Math.random() * 900000)}` // Admin ID
        });

        await adminUser.save();

        // Remove sensitive data from response
        const { password: _, refreshToken: __, ...adminData } = adminUser.toObject();

        res.status(201).json({
            success: true,
            message: 'Admin user created successfully',
            data: adminData
        });
    } catch (error) {
        console.error('Error creating admin user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create admin user',
            error: error.message
        });
    }
};

/**
 * Cache Management
 */
const manageCaches = async (req, res) => {
    try {
        const { action, pattern } = req.body;

        switch (action) {
            case 'clear_all':
                await invalidateCacheByPattern('*');
                break;

            case 'clear_pattern':
                if (!pattern) {
                    return res.status(400).json({
                        success: false,
                        message: 'Pattern is required for pattern-based cache clearing'
                    });
                }
                await invalidateCacheByPattern(pattern);
                break;

            case 'clear_user_caches':
                await invalidateCacheByPattern('*all_usernames*');
                await invalidateCacheByPattern('*all_emails*');
                await invalidateCacheByPattern('*all_phone_numbers*');
                break;

            case 'clear_stats':
                await invalidateCacheByPattern('*admin_dashboard_stats*');
                await invalidateCacheByPattern('*system_health*');
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid cache action'
                });
        }

        res.status(200).json({
            success: true,
            message: `Cache ${action} completed successfully`
        });
    } catch (error) {
        console.error('Error managing caches:', error);
        res.status(500).json({
            success: false,
            message: 'Cache management failed',
            error: error.message
        });
    }
};

/**
 * Notification Management
 */
const sendBulkNotification = async (req, res) => {
    try {
        const { title, message, audience, userIds, type = 'info', method = ['in-app'] } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        let targetUsers = [];

        if (audience === 'all') {
            targetUsers = await User.find({}, 'pgpalId role').lean();
        } else if (audience === 'owners') {
            targetUsers = await User.find({ role: 'owner' }, 'pgpalId role').lean();
        } else if (audience === 'tenants') {
            targetUsers = await User.find({ role: 'tenant' }, 'pgpalId role').lean();
        } else if (userIds && Array.isArray(userIds)) {
            targetUsers = await User.find({ _id: { $in: userIds } }, 'pgpalId role').lean();
        }

        // Queue notifications for each user
        const notifications = targetUsers.map(user => ({
            [user.role === 'tenant' ? 'tenantId' : 'ownerId']: user.role === 'tenant' ? user.pgpalId : user._id,
            audience: user.role,
            title,
            message,
            type,
            method,
            createdBy: req.user.username || 'admin'
        }));

        // Add all notifications to queue
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

        res.status(200).json({
            success: true,
            message: `Notification sent to ${targetUsers.length} users`,
            data: {
                targetCount: targetUsers.length,
                audience
            }
        });
    } catch (error) {
        console.error('Error sending bulk notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk notification',
            error: error.message
        });
    }
};

/**
 * Export User Data
 */
const exportUserData = async (req, res) => {
    try {
        const { format = 'json', filters = {} } = req.query;

        const query = {};
        if (filters.role) query.role = filters.role;
        if (filters.verified !== undefined) query.isVerified = filters.verified === 'true';

        const users = await User.find(query)
            .select('-password -refreshToken -passwordResetToken -otp')
            .lean();

        if (format === 'csv') {
            // Convert to CSV format
            const csv = convertToCSV(users);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv');
            res.send(csv);
        } else {
            res.status(200).json({
                success: true,
                data: users,
                count: users.length,
                exportedAt: new Date()
            });
        }
    } catch (error) {
        console.error('Error exporting user data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export user data',
            error: error.message
        });
    }
};

const convertToCSV = (data) => {
    if (!data.length) return '';

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row =>
            headers.map(header => {
                const value = row[header];
                if (typeof value === 'object' && value !== null) {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',')
        )
    ].join('\n');

    return csvContent;
};

const suspendUser = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await User.findByIdAndUpdate(
            userId,
            { isSuspended: true, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        // Invalidate caches
        await invalidateCacheByPattern('*admin_dashboard_stats*');
        await invalidateCacheByPattern('*all_usernames*');
        await invalidateCacheByPattern('*all_emails*');
        await invalidateCacheByPattern('*all_phone_numbers*');

        res.status(200).json({
            success: true,
            message: 'User suspended successfully',
            data: user
        });
    } catch (error) {
        console.error('Error suspending user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to suspend user',
            error: error.message
        });
    }
};

const removeSuspension = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await User.findByIdAndUpdate(
            userId,
            { isSuspended: false, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        // Invalidate caches
        await invalidateCacheByPattern('*admin_dashboard_stats*');
        await invalidateCacheByPattern('*all_usernames*');
        await invalidateCacheByPattern('*all_emails*');
        await invalidateCacheByPattern('*all_phone_numbers*');

        res.status(200).json({
            success: true,
            message: 'User unsuspended successfully',
            data: user
        });
    } catch (error) {
        console.error('Error unsuspending user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unsuspend user',
            error: error.message
        });
    }
};

module.exports = {
    getDashboardStats,
    getAllUsers,
    getUserDetails,
    updateUser,
    deleteUser,
    bulkUserOperations,
    getSystemHealth,
    getUserRegistrationTrends,
    createAdminUser,
    manageCaches,
    sendBulkNotification,
    exportUserData,
    suspendUser,
    removeSuspension
};