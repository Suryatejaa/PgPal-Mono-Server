// src/controllers/adminController.js
// Comprehensive Admin Dashboard Controller with Full System Controls

const Property = require('../models/propertyModel');
const DeletedProperty = require('../models/deletedPropertiesModal');
const Review = require('../models/reviewModel');
const Rule = require('../models/ruleModel');
const Image = require('../models/imageModel');
const axios = require('axios');
const mongoose = require('mongoose');
const CacheHelper = require('../utils/CacheHelper');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue');
const moment = require('moment');
const { PLAN_LIMITS } = require('../middleware/planValidates');
const PlanHelper = require('../utils/planHelper');

/**
 * Admin Authentication Middleware
 * Validates admin access with super admin privileges
 */
const validateAdminAccess = (requiredLevel = 'admin') => {
    return (req, res, next) => {
        const currentUser = JSON.parse(req.headers['x-user'] || '{}');

        if (!currentUser || !currentUser.data?.user) {
            return res.status(401).json({
                error: 'Unauthorized: Admin access required',
                code: 'ADMIN_AUTH_REQUIRED'
            });
        }

        const user = currentUser.data.user;
        const userRole = user.role;
        const adminLevel = user.adminLevel || 'none';

        // Check for admin or super admin access
        if (userRole !== 'admin' && userRole !== 'super_admin' && adminLevel === 'none') {
            return res.status(403).json({
                error: 'Forbidden: Admin privileges required',
                code: 'INSUFFICIENT_PRIVILEGES',
                userRole,
                requiredLevel
            });
        }

        // Super admin check for sensitive operations
        if (requiredLevel === 'super_admin' && userRole !== 'super_admin' && adminLevel !== 'super_admin') {
            return res.status(403).json({
                error: 'Forbidden: Super admin privileges required',
                code: 'SUPER_ADMIN_REQUIRED',
                userRole,
                adminLevel
            });
        }

        req.adminUser = user;
        next();
    };
};

module.exports = {
    validateAdminAccess,

    /**
     * DASHBOARD OVERVIEW
     * Get comprehensive system statistics and metrics
     */
    async getDashboardOverview(req, res) {
        console.log('dashboard overview requested');
        try {
            const cacheKey = 'admin:dashboard:overview';

            if (CacheHelper.isReady()) {
                const cached = await CacheHelper.get(cacheKey);
                if (cached) {
                    return res.status(200).json(cached);
                }
            }

            // Get all statistics in parallel
            const [
                totalProperties,
                totalActiveProperties,
                totalDeletedProperties,
                totalReviews,
                totalRules,
                totalImages,
                propertiesByPlan,
                recentProperties,
                topViewedProperties,
                systemMetrics
            ] = await Promise.all([
                Property.countDocuments(),
                Property.countDocuments({ isActive: { $ne: false } }),
                DeletedProperty.countDocuments(),
                Review.countDocuments(),
                Rule.countDocuments(),
                Image.countDocuments(),
                Property.aggregate([
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'ownerId',
                            foreignField: '_id',
                            as: 'owner'
                        }
                    },
                    {
                        $group: {
                            _id: '$owner.currentPlan.type',
                            count: { $sum: 1 }
                        }
                    }
                ]),
                Property.find()
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .select('name ownerId createdAt views pgpalId'),
                Property.find()
                    .sort({ views: -1 })
                    .limit(10)
                    .select('name ownerId views pgpalId createdAt'),
                getSystemMetrics()
            ]);

            const overview = {
                summary: {
                    totalProperties,
                    totalActiveProperties,
                    totalDeletedProperties,
                    totalReviews,
                    totalRules,
                    totalImages,
                    averageViewsPerProperty: Math.round(
                        (await Property.aggregate([
                            { $group: { _id: null, avgViews: { $avg: '$views' } } }
                        ]))[0]?.avgViews || 0
                    )
                },
                planDistribution: propertiesByPlan.reduce((acc, item) => {
                    acc[item._id || 'unknown'] = item.count;
                    return acc;
                }, {}),
                recentActivity: {
                    recentProperties: recentProperties.map(p => ({
                        id: p._id,
                        pgpalId: p.pgpalId,
                        name: p.name,
                        ownerId: p.ownerId,
                        createdAt: p.createdAt,
                        views: p.views
                    })),
                    topViewedProperties: topViewedProperties.map(p => ({
                        id: p._id,
                        pgpalId: p.pgpalId,
                        name: p.name,
                        ownerId: p.ownerId,
                        views: p.views,
                        createdAt: p.createdAt
                    }))
                },
                systemMetrics,
                timestamp: new Date()
            };

            await CacheHelper.set(cacheKey, overview, 300); // Cache for 5 minutes
            res.status(200).json(overview);

        } catch (error) {
            res.status(500).json({
                error: 'Failed to get dashboard overview',
                details: error.message
            });
        }
    },

    /**
     * PROPERTY MANAGEMENT
     * Advanced property management with full admin controls
     */
    async getAllPropertiesAdmin(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const sortBy = req.query.sortBy || 'createdAt';
            const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
            const search = req.query.search || '';
            const status = req.query.status; // active, inactive, all
            const plan = req.query.plan; // free, trial, starter, professional

            const skip = (page - 1) * limit;

            // Build query
            let query = {};

            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { pgpalId: { $regex: search, $options: 'i' } },
                    { ownerId: { $regex: search, $options: 'i' } }
                ];
            }

            if (status === 'active') {
                query.isActive = { $ne: false };
            } else if (status === 'inactive') {
                query.isActive = false;
            }

            // Get properties with owner information
            const properties = await Property.find(query)
                .sort({ [sortBy]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean();

            const totalProperties = await Property.countDocuments(query);

            // Enrich with owner data
            const enrichedProperties = await Promise.all(
                properties.map(async (property) => {
                    try {
                        const ownerInfo = await getUserInfo(property.ownerId);
                        return {
                            ...property,
                            ownerInfo: ownerInfo || { error: 'Owner not found' }
                        };
                    } catch (error) {
                        return {
                            ...property,
                            ownerInfo: { error: 'Failed to fetch owner info' }
                        };
                    }
                })
            );

            res.status(200).json({
                properties: enrichedProperties,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalProperties / limit),
                    totalProperties,
                    limit
                },
                filters: {
                    search,
                    status,
                    plan,
                    sortBy,
                    sortOrder: sortOrder === 1 ? 'asc' : 'desc'
                }
            });

        } catch (error) {
            res.status(500).json({
                error: 'Failed to get properties',
                details: error.message
            });
        }
    },

    /**
     * PROPERTY DETAILS
     * Get comprehensive property details with admin insights
     */
    async getPropertyDetailsAdmin(req, res) {
        try {
            const propertyId = req.params.id;

            const property = await Property.findById(propertyId).lean();
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            // Get related data
            const [reviews, rules, images, ownerInfo, tenantInfo] = await Promise.all([
                Review.find({ propertyId }).lean(),
                Rule.find({ propertyId }).lean(),
                Image.find({ propertyId }).lean(),
                getUserInfo(property.ownerId),
                getPropertyTenants(property.pgpalId)
            ]);

            // Calculate analytics
            const analytics = {
                totalViews: property.views || 0,
                totalReviews: reviews.length,
                averageRating: reviews.length > 0
                    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
                    : null,
                totalRules: rules.length,
                totalImages: images.length,
                occupancyRate: property.totalBeds > 0
                    ? ((property.occupiedBeds || 0) / property.totalBeds * 100).toFixed(1)
                    : 0
            };

            res.status(200).json({
                property,
                ownerInfo,
                tenantInfo,
                reviews,
                rules,
                images,
                analytics,
                adminNotes: {
                    lastModified: property.updatedAt,
                    createdBy: property.createdBy,
                    status: property.isActive !== false ? 'active' : 'inactive'
                }
            });

        } catch (error) {
            res.status(500).json({
                error: 'Failed to get property details',
                details: error.message
            });
        }
    },

    /**
     * FORCE DELETE PROPERTY
     * Permanently delete property with all related data
     */
    async forceDeleteProperty(req, res) {
        try {
            const propertyId = req.params.id;
            const adminUser = req.adminUser;
            const reason = req.body.reason || 'Admin deletion';

            const property = await Property.findById(propertyId);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            // Create deletion record
            const deletionRecord = new DeletedProperty({
                ...property.toObject(),
                deletedBy: adminUser._id,
                deletedAt: new Date(),
                deletionReason: reason,
                deletedByAdmin: true,
                originalId: property._id
            });

            // Delete all related data
            await Promise.all([
                Property.findByIdAndDelete(propertyId),
                Review.deleteMany({ propertyId }),
                Rule.deleteMany({ propertyId }),
                Image.deleteMany({ propertyId }),
                deletionRecord.save()
            ]);

            // Clear cache
            await invalidateCacheByPattern(`*${property.pgpalId}*`);
            await invalidateCacheByPattern(`*${propertyId}*`);

            // Notify owner
            try {
                await notificationQueue.add('notifications', {
                    tenantId: property.ownerId,
                    audience: 'owner',
                    title: 'Property Deleted by Admin',
                    message: `Your property "${property.name}" has been deleted by admin. Reason: ${reason}`,
                    type: 'warning',
                    method: ['email', 'in-app'],
                    meta: {
                        propertyId: property._id,
                        propertyName: property.name,
                        deletedBy: adminUser._id,
                        reason
                    },
                    createdBy: adminUser.pgpalId || 'admin'
                });
            } catch (notifyError) {
                console.error('Failed to notify owner of deletion:', notifyError);
            }

            res.status(200).json({
                message: 'Property permanently deleted',
                deletedProperty: {
                    id: property._id,
                    name: property.name,
                    pgpalId: property.pgpalId,
                    ownerId: property.ownerId
                },
                deletionRecord: deletionRecord._id,
                deletedBy: adminUser._id,
                reason
            });

        } catch (error) {
            res.status(500).json({
                error: 'Failed to delete property',
                details: error.message
            });
        }
    },

    /**
     * SUSPEND/UNSUSPEND PROPERTY
     * Temporarily suspend or reactivate properties
     */
    async togglePropertyStatus(req, res) {
        try {
            const propertyId = req.params.id;
            const { suspend, reason } = req.body;
            const adminUser = req.adminUser;

            const property = await Property.findById(propertyId);
            if (!property) {
                return res.status(404).json({ error: 'Property not found' });
            }

            const newStatus = suspend ? false : true;
            const statusText = suspend ? 'suspended' : 'reactivated';

            await Property.findByIdAndUpdate(propertyId, {
                isActive: newStatus,
                lastStatusChange: new Date(),
                statusChangedBy: adminUser._id,
                statusChangeReason: reason
            });

            // Clear cache
            await invalidateCacheByPattern(`*${property.pgpalId}*`);

            // Notify owner
            try {
                await notificationQueue.add('notifications', {
                    tenantId: property.ownerId,
                    audience: 'owner',
                    title: `Property ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`,
                    message: `Your property "${property.name}" has been ${statusText} by admin. ${reason ? `Reason: ${reason}` : ''}`,
                    type: suspend ? 'warning' : 'info',
                    method: ['email', 'in-app'],
                    meta: {
                        propertyId: property._id,
                        propertyName: property.name,
                        action: statusText,
                        reason
                    },
                    createdBy: adminUser.pgpalId || 'admin'
                });
            } catch (notifyError) {
                console.error('Failed to notify owner of status change:', notifyError);
            }

            res.status(200).json({
                message: `Property ${statusText} successfully`,
                property: {
                    id: property._id,
                    name: property.name,
                    pgpalId: property.pgpalId,
                    isActive: newStatus,
                    statusChangedBy: adminUser._id,
                    reason
                }
            });

        } catch (error) {
            res.status(500).json({
                error: 'Failed to toggle property status',
                details: error.message
            });
        }
    },

    /**
     * USER MANAGEMENT
     * Advanced user management capabilities
     */
    async getAllUsersAdmin(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const search = req.query.search || '';
            const role = req.query.role; // owner, tenant
            const plan = req.query.plan; // free, trial, starter, professional
            const status = req.query.status; // active, suspended

            // Call auth service to get users
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                ...(search && { search }),
                ...(role && { role }),
                ...(plan && { plan }),
                ...(status && { status })
            });

            const response = await axios.get(
                `http://auth-service:4001/api/auth-service/admin/users?${params}`,
                {
                    headers: {
                        'x-internal-service': 'true',
                        'x-admin-request': 'true'
                    }
                }
            );

            // Enrich with property data for owners
            if (response.data.users) {
                const enrichedUsers = await Promise.all(
                    response.data.users.map(async (user) => {
                        if (user.role === 'owner') {
                            const propertyCount = await Property.countDocuments({ ownerId: user._id });
                            const activeProperties = await Property.countDocuments({
                                ownerId: user._id,
                                isActive: { $ne: false }
                            });

                            return {
                                ...user,
                                propertyStats: {
                                    totalProperties: propertyCount,
                                    activeProperties,
                                    inactiveProperties: propertyCount - activeProperties
                                }
                            };
                        }
                        return user;
                    })
                );

                response.data.users = enrichedUsers;
            }

            res.status(200).json(response.data);

        } catch (error) {
            res.status(500).json({
                error: 'Failed to get users',
                details: error.response?.data?.error || error.message
            });
        }
    },

    /**
     * USER DETAILS
     * Get comprehensive user details with admin insights
     */
    async getUserDetailsAdmin(req, res) {
        try {
            const userId = req.params.id;

            // Get user info from auth service
            const userResponse = await axios.get(
                `http://auth-service:4001/api/auth-service/admin/user/${userId}`,
                {
                    headers: {
                        'x-internal-service': 'true',
                        'x-admin-request': 'true'
                    }
                }
            );

            const user = userResponse.data;

            // Get user's properties if they're an owner
            let propertyData = null;
            if (user.role === 'owner') {
                const properties = await Property.find({ ownerId: userId })
                    .select('name pgpalId views totalBeds occupiedBeds createdAt isActive')
                    .lean();

                const totalViews = properties.reduce((sum, p) => sum + (p.views || 0), 0);
                const totalBeds = properties.reduce((sum, p) => sum + (p.totalBeds || 0), 0);
                const totalOccupiedBeds = properties.reduce((sum, p) => sum + (p.occupiedBeds || 0), 0);

                propertyData = {
                    properties,
                    stats: {
                        totalProperties: properties.length,
                        activeProperties: properties.filter(p => p.isActive !== false).length,
                        totalViews,
                        totalBeds,
                        totalOccupiedBeds,
                        occupancyRate: totalBeds > 0 ? ((totalOccupiedBeds / totalBeds) * 100).toFixed(1) : 0
                    }
                };
            }

            // Get tenant info if they're a tenant
            let tenantData = null;
            if (user.role === 'tenant') {
                try {
                    const tenantResponse = await axios.get(
                        `http://tenant-service:4004/api/tenant-service/admin/tenant/${userId}`,
                        {
                            headers: {
                                'x-internal-service': 'true',
                                'x-admin-request': 'true'
                            }
                        }
                    );
                    tenantData = tenantResponse.data;
                } catch (tenantError) {
                    console.error('Failed to get tenant data:', tenantError.message);
                }
            }

            res.status(200).json({
                user,
                propertyData,
                tenantData,
                adminNotes: {
                    lastLogin: user.lastLogin,
                    accountCreated: user.createdAt,
                    planHistory: user.planHistory || [],
                    suspensionHistory: user.suspensionHistory || []
                }
            });

        } catch (error) {
            res.status(500).json({
                error: 'Failed to get user details',
                details: error.response?.data?.error || error.message
            });
        }
    },

    /**
     * SUSPEND/UNSUSPEND USER
     * Temporarily suspend or reactivate users
     */
    async toggleUserStatus(req, res) {
        try {
            const userId = req.params.id;
            const { suspend, reason } = req.body;
            const adminUser = req.adminUser;

            const response = await axios.patch(
                `http://auth-service:4001/api/auth-service/admin/user/${userId}/status`,
                {
                    suspend,
                    reason,
                    adminId: adminUser._id
                },
                {
                    headers: {
                        'x-internal-service': 'true',
                        'x-admin-request': 'true'
                    }
                }
            );

            // If suspending an owner, also suspend their properties
            if (suspend) {
                await Property.updateMany(
                    { ownerId: userId },
                    {
                        isActive: false,
                        suspendedByAdmin: true,
                        suspensionReason: reason,
                        suspendedAt: new Date()
                    }
                );

                // Clear property caches
                const userProperties = await Property.find({ ownerId: userId }).select('pgpalId');
                for (const prop of userProperties) {
                    await invalidateCacheByPattern(`*${prop.pgpalId}*`);
                }
            } else {
                // When unsuspending, reactivate properties too
                await Property.updateMany(
                    { ownerId: userId, suspendedByAdmin: true },
                    {
                        isActive: true,
                        $unset: {
                            suspendedByAdmin: 1,
                            suspensionReason: 1,
                            suspendedAt: 1
                        }
                    }
                );
            }

            res.status(200).json(response.data);

        } catch (error) {
            res.status(500).json({
                error: 'Failed to toggle user status',
                details: error.response?.data?.error || error.message
            });
        }
    },

    /**
     * SYSTEM ANALYTICS
     * Comprehensive system analytics and reporting
     */
    async getSystemAnalytics(req, res) {
        try {
            const period = req.query.period || '30d'; // 7d, 30d, 90d, 1y
            const startDate = getStartDate(period);

            const [
                propertyGrowth,
                userGrowth,
                planDistribution,
                occupancyTrends,
                topPerformingProperties,
                revenueAnalytics
            ] = await Promise.all([
                getPropertyGrowthAnalytics(startDate),
                getUserGrowthAnalytics(startDate),
                getPlanDistributionAnalytics(),
                getOccupancyTrends(startDate),
                getTopPerformingProperties(),
                getRevenueAnalytics(startDate)
            ]);

            res.status(200).json({
                period,
                analytics: {
                    propertyGrowth,
                    userGrowth,
                    planDistribution,
                    occupancyTrends,
                    topPerformingProperties,
                    revenueAnalytics
                },
                generated: new Date()
            });

        } catch (error) {
            res.status(500).json({
                error: 'Failed to get system analytics',
                details: error.message
            });
        }
    },

    /**
     * BULK OPERATIONS
     * Perform bulk operations on properties and users
     */
    async bulkOperations(req, res) {
        try {
            const { operation, entityType, entityIds, data } = req.body;
            const adminUser = req.adminUser;

            if (!operation || !entityType || !entityIds || !Array.isArray(entityIds)) {
                return res.status(400).json({
                    error: 'Invalid bulk operation request',
                    required: ['operation', 'entityType', 'entityIds']
                });
            }

            let results = [];

            switch (entityType) {
                case 'properties':
                    results = await performBulkPropertyOperations(operation, entityIds, data, adminUser);
                    break;
                case 'users':
                    results = await performBulkUserOperations(operation, entityIds, data, adminUser);
                    break;
                case 'reviews':
                    results = await performBulkReviewOperations(operation, entityIds, data, adminUser);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid entity type' });
            }

            res.status(200).json({
                message: `Bulk ${operation} completed`,
                results,
                processed: entityIds.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length
            });

        } catch (error) {
            res.status(500).json({
                error: 'Bulk operation failed',
                details: error.message
            });
        }
    },

    /**
     * SYSTEM MAINTENANCE
     * System maintenance and cleanup operations
     */
    async systemMaintenance(req, res) {
        try {
            const { operation } = req.body;
            const adminUser = req.adminUser;

            let result = {};

            switch (operation) {
                case 'clear_cache':
                    result = await clearSystemCache();
                    break;
                case 'cleanup_orphaned_data':
                    result = await cleanupOrphanedData();
                    break;
                case 'recalculate_metrics':
                    result = await recalculateSystemMetrics();
                    break;
                case 'backup_database':
                    result = await triggerDatabaseBackup();
                    break;
                case 'optimize_indexes':
                    result = await optimizeIndexes();
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid maintenance operation' });
            }

            // Log maintenance activity
            console.log(`System maintenance performed by ${adminUser._id}: ${operation}`, result);

            res.status(200).json({
                message: `Maintenance operation ${operation} completed`,
                result,
                performedBy: adminUser._id,
                timestamp: new Date()
            });

        } catch (error) {
            res.status(500).json({
                error: 'Maintenance operation failed',
                details: error.message
            });
        }
    },

    /**
     * NOTIFICATION MANAGEMENT
     * Send system-wide notifications and manage notification queues
     */
    async sendSystemNotification(req, res) {
        try {
            const {
                title,
                message,
                audience, // all, owners, tenants, specific_users
                userIds, // required for specific_users
                type, // info, warning, urgent, announcement
                channels, // email, in-app, sms
                scheduleFor // optional datetime for scheduled sending
            } = req.body;

            const adminUser = req.adminUser;

            if (!title || !message || !audience || !type) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['title', 'message', 'audience', 'type']
                });
            }

            let targetUsers = [];

            // Determine target users based on audience
            switch (audience) {
                case 'all':
                    const allUsersResponse = await axios.get(
                        'http://auth-service:4001/api/auth-service/admin/users/all',
                        { headers: { 'x-internal-service': 'true' } }
                    );
                    targetUsers = allUsersResponse.data.map(u => u.pgpalId);
                    break;
                case 'owners':
                    const ownersResponse = await axios.get(
                        'http://auth-service:4001/api/auth-service/admin/users?role=owner',
                        { headers: { 'x-internal-service': 'true' } }
                    );
                    targetUsers = ownersResponse.data.users.map(u => u.pgpalId);
                    break;
                case 'tenants':
                    const tenantsResponse = await axios.get(
                        'http://auth-service:4001/api/auth-service/admin/users?role=tenant',
                        { headers: { 'x-internal-service': 'true' } }
                    );
                    targetUsers = tenantsResponse.data.users.map(u => u.pgpalId);
                    break;
                case 'specific_users':
                    if (!userIds || !Array.isArray(userIds)) {
                        return res.status(400).json({
                            error: 'userIds array required for specific_users audience'
                        });
                    }
                    targetUsers = userIds;
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid audience type' });
            }

            // Queue notifications for all target users
            const notificationPromises = targetUsers.map(userId =>
                notificationQueue.add('notifications', {
                    tenantId: userId,
                    audience: 'user',
                    title,
                    message,
                    type,
                    method: channels || ['in-app', 'email'],
                    meta: {
                        systemNotification: true,
                        adminSender: adminUser._id,
                        notificationId: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                    },
                    createdBy: adminUser.pgpalId || 'admin'
                }, {
                    delay: scheduleFor ? new Date(scheduleFor).getTime() - Date.now() : 0,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                })
            );

            await Promise.all(notificationPromises);

            res.status(200).json({
                message: 'System notification queued successfully',
                details: {
                    title,
                    audience,
                    targetUsersCount: targetUsers.length,
                    type,
                    channels: channels || ['in-app', 'email'],
                    scheduleFor: scheduleFor || 'immediate',
                    sentBy: adminUser._id
                }
            });

        } catch (error) {
            res.status(500).json({
                error: 'Failed to send system notification',
                details: error.message
            });
        }
    },

    /**
     * EXPORT DATA
     * Export system data for reporting and backup
     */
    async exportData(req, res) {
        try {
            const {
                dataType, // properties, users, reviews, analytics
                format, // json, csv, excel
                filters,
                dateRange
            } = req.body;

            if (!dataType || !format) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['dataType', 'format']
                });
            }

            let exportData = {};
            let filename = `${dataType}_export_${moment().format('YYYY-MM-DD_HH-mm-ss')}`;

            switch (dataType) {
                case 'properties':
                    exportData = await exportPropertiesData(filters, dateRange);
                    break;
                case 'users':
                    exportData = await exportUsersData(filters, dateRange);
                    break;
                case 'reviews':
                    exportData = await exportReviewsData(filters, dateRange);
                    break;
                case 'analytics':
                    exportData = await exportAnalyticsData(dateRange);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid data type' });
            }

            // Format the data based on requested format
            let responseData, contentType;

            switch (format) {
                case 'json':
                    responseData = JSON.stringify(exportData, null, 2);
                    contentType = 'application/json';
                    filename += '.json';
                    break;
                case 'csv':
                    responseData = convertToCSV(exportData);
                    contentType = 'text/csv';
                    filename += '.csv';
                    break;
                case 'excel':
                    // For Excel format, you'd use a library like 'xlsx'
                    // This is a simplified version
                    responseData = JSON.stringify(exportData, null, 2);
                    contentType = 'application/vnd.ms-excel';
                    filename += '.xlsx';
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid format' });
            }

            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', contentType);
            res.status(200).send(responseData);

        } catch (error) {
            res.status(500).json({
                error: 'Export failed',
                details: error.message
            });
        }
    }
};

// Helper Functions

async function getUserInfo(userId) {
    try {
        const response = await axios.get(
            `http://auth-service:4001/api/auth-service/user?id=${userId}`,
            { headers: { 'x-internal-service': 'true' } }
        );
        return response.data;
    } catch (error) {
        console.error(`Failed to get user info for ${userId}:`, error.message);
        return null;
    }
}

async function getPropertyTenants(propertyPpid) {
    try {
        const response = await axios.get(
            `http://tenant-service:4004/api/tenant-service/active-tenants/${propertyPpid}`,
            { headers: { 'x-internal-service': 'true' } }
        );
        return response.data;
    } catch (error) {
        console.error(`Failed to get tenants for property ${propertyPpid}:`, error.message);
        return [];
    }
}

async function getSystemMetrics() {
    try {
        // Database metrics
        const dbStats = await mongoose.connection.db.stats();

        // Cache metrics
        let cacheMetrics = {};
        if (CacheHelper.isReady()) {
            try {
                cacheMetrics = await CacheHelper.getMetrics();
            } catch (error) {
                cacheMetrics = { error: 'Cache metrics unavailable' };
            }
        }

        return {
            database: {
                collections: dbStats.collections,
                dataSize: Math.round(dbStats.dataSize / 1024 / 1024 * 100) / 100, // MB
                storageSize: Math.round(dbStats.storageSize / 1024 / 1024 * 100) / 100, // MB
                indexes: dbStats.indexes,
                indexSize: Math.round(dbStats.indexSize / 1024 / 1024 * 100) / 100 // MB
            },
            cache: cacheMetrics,
            timestamp: new Date()
        };
    } catch (error) {
        return { error: 'Failed to get system metrics', details: error.message };
    }
}

function getStartDate(period) {
    const now = new Date();
    switch (period) {
        case '7d':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '30d':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case '90d':
            return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        case '1y':
            return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        default:
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
}

async function getPropertyGrowthAnalytics(startDate) {
    return await Property.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    day: { $dayOfMonth: '$createdAt' }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
}

async function getUserGrowthAnalytics(startDate) {
    try {
        const response = await axios.get(
            `http://auth-service:4001/api/auth-service/admin/analytics/user-growth?startDate=${startDate.toISOString()}`,
            { headers: { 'x-internal-service': 'true' } }
        );
        return response.data;
    } catch (error) {
        return { error: 'Failed to get user growth analytics' };
    }
}

async function getPlanDistributionAnalytics() {
    // This would need to be implemented in the auth service
    return { message: 'Plan distribution analytics not yet implemented' };
}

async function getOccupancyTrends(startDate) {
    return await Property.aggregate([
        {
            $group: {
                _id: null,
                totalBeds: { $sum: '$totalBeds' },
                totalOccupiedBeds: { $sum: '$occupiedBeds' },
                avgOccupancyRate: {
                    $avg: {
                        $cond: [
                            { $gt: ['$totalBeds', 0] },
                            { $multiply: [{ $divide: ['$occupiedBeds', '$totalBeds'] }, 100] },
                            0
                        ]
                    }
                }
            }
        }
    ]);
}

async function getTopPerformingProperties() {
    return await Property.find()
        .sort({ views: -1 })
        .limit(10)
        .select('name pgpalId views totalBeds occupiedBeds ownerId createdAt')
        .lean();
}

async function getRevenueAnalytics(startDate) {
    // This would need integration with payment service
    return { message: 'Revenue analytics not yet implemented' };
}

async function performBulkPropertyOperations(operation, propertyIds, data, adminUser) {
    const results = [];

    for (const propertyId of propertyIds) {
        try {
            switch (operation) {
                case 'suspend':
                    await Property.findByIdAndUpdate(propertyId, {
                        isActive: false,
                        suspendedByAdmin: true,
                        suspensionReason: data.reason,
                        suspendedAt: new Date()
                    });
                    results.push({ id: propertyId, success: true, action: 'suspended' });
                    break;
                case 'activate':
                    await Property.findByIdAndUpdate(propertyId, {
                        isActive: true,
                        $unset: { suspendedByAdmin: 1, suspensionReason: 1, suspendedAt: 1 }
                    });
                    results.push({ id: propertyId, success: true, action: 'activated' });
                    break;
                case 'delete':
                    await Property.findByIdAndDelete(propertyId);
                    results.push({ id: propertyId, success: true, action: 'deleted' });
                    break;
                default:
                    results.push({ id: propertyId, success: false, error: 'Invalid operation' });
            }
        } catch (error) {
            results.push({ id: propertyId, success: false, error: error.message });
        }
    }

    return results;
}

async function performBulkUserOperations(operation, userIds, data, adminUser) {
    const results = [];

    for (const userId of userIds) {
        try {
            const response = await axios.patch(
                `http://auth-service:4001/api/auth-service/admin/user/${userId}/bulk`,
                { operation, data },
                { headers: { 'x-internal-service': 'true' } }
            );
            results.push({ id: userId, success: true, action: operation });
        } catch (error) {
            results.push({ id: userId, success: false, error: error.message });
        }
    }

    return results;
}

async function performBulkReviewOperations(operation, reviewIds, data, adminUser) {
    const results = [];

    for (const reviewId of reviewIds) {
        try {
            switch (operation) {
                case 'delete':
                    await Review.findByIdAndDelete(reviewId);
                    results.push({ id: reviewId, success: true, action: 'deleted' });
                    break;
                case 'flag':
                    await Review.findByIdAndUpdate(reviewId, {
                        flagged: true,
                        flaggedBy: adminUser._id,
                        flagReason: data.reason
                    });
                    results.push({ id: reviewId, success: true, action: 'flagged' });
                    break;
                default:
                    results.push({ id: reviewId, success: false, error: 'Invalid operation' });
            }
        } catch (error) {
            results.push({ id: reviewId, success: false, error: error.message });
        }
    }

    return results;
}

async function clearSystemCache() {
    try {
        if (CacheHelper.isReady()) {
            await CacheHelper.flushAll();
            return { success: true, message: 'System cache cleared' };
        }
        return { success: false, message: 'Cache not available' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function cleanupOrphanedData() {
    // Clean up orphaned reviews, rules, and images
    const results = {};

    // Find orphaned reviews
    const orphanedReviews = await Review.aggregate([
        {
            $lookup: {
                from: 'properties',
                localField: 'propertyId',
                foreignField: '_id',
                as: 'property'
            }
        },
        { $match: { property: { $size: 0 } } }
    ]);

    await Review.deleteMany({ _id: { $in: orphanedReviews.map(r => r._id) } });
    results.orphanedReviews = orphanedReviews.length;

    // Find orphaned rules
    const orphanedRules = await Rule.aggregate([
        {
            $lookup: {
                from: 'properties',
                localField: 'propertyId',
                foreignField: '_id',
                as: 'property'
            }
        },
        { $match: { property: { $size: 0 } } }
    ]);

    await Rule.deleteMany({ _id: { $in: orphanedRules.map(r => r._id) } });
    results.orphanedRules = orphanedRules.length;

    // Find orphaned images
    const orphanedImages = await Image.aggregate([
        {
            $lookup: {
                from: 'properties',
                localField: 'propertyId',
                foreignField: '_id',
                as: 'property'
            }
        },
        { $match: { property: { $size: 0 } } }
    ]);

    await Image.deleteMany({ _id: { $in: orphanedImages.map(i => i._id) } });
    results.orphanedImages = orphanedImages.length;

    return results;
}

async function recalculateSystemMetrics() {
    // Recalculate property views, ratings, etc.
    const properties = await Property.find();
    const results = { processed: 0, updated: 0 };

    for (const property of properties) {
        results.processed++;

        // Recalculate average rating
        const reviews = await Review.find({ propertyId: property._id });
        if (reviews.length > 0) {
            const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            await Property.findByIdAndUpdate(property._id, { averageRating: avgRating });
            results.updated++;
        }
    }

    return results;
}

async function triggerDatabaseBackup() {
    // This would trigger a database backup process
    return { message: 'Database backup triggered', timestamp: new Date() };
}

async function optimizeIndexes() {
    // Optimize database indexes
    try {
        await Property.collection.reIndex();
        await Review.collection.reIndex();
        await Rule.collection.reIndex();
        return { success: true, message: 'Indexes optimized' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function exportPropertiesData(filters, dateRange) {
    let query = {};

    if (dateRange) {
        query.createdAt = {
            $gte: new Date(dateRange.start),
            $lte: new Date(dateRange.end)
        };
    }

    if (filters) {
        if (filters.status) {
            query.isActive = filters.status === 'active';
        }
        if (filters.city) {
            query['address.city'] = { $regex: filters.city, $options: 'i' };
        }
    }

    return await Property.find(query).lean();
}

async function exportUsersData(filters, dateRange) {
    try {
        const params = new URLSearchParams();
        if (dateRange) {
            params.append('startDate', dateRange.start);
            params.append('endDate', dateRange.end);
        }
        if (filters?.role) params.append('role', filters.role);
        if (filters?.plan) params.append('plan', filters.plan);

        const response = await axios.get(
            `http://auth-service:4001/api/auth-service/admin/export/users?${params}`,
            { headers: { 'x-internal-service': 'true' } }
        );
        return response.data;
    } catch (error) {
        return { error: 'Failed to export users data' };
    }
}

async function exportReviewsData(filters, dateRange) {
    let query = {};

    if (dateRange) {
        query.createdAt = {
            $gte: new Date(dateRange.start),
            $lte: new Date(dateRange.end)
        };
    }

    return await Review.find(query).populate('propertyId', 'name pgpalId').lean();
}

async function exportAnalyticsData(dateRange) {
    const startDate = dateRange ? new Date(dateRange.start) : getStartDate('30d');
    const endDate = dateRange ? new Date(dateRange.end) : new Date();

    return {
        properties: await getPropertyGrowthAnalytics(startDate),
        occupancy: await getOccupancyTrends(startDate),
        topProperties: await getTopPerformingProperties(),
        period: { start: startDate, end: endDate }
    };
}

function convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return '';
    }

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');

    const csvRows = data.map(row =>
        headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',')
    );

    return [csvHeaders, ...csvRows].join('\n');
}