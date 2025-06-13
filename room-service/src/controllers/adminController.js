const Room = require('../models/roomModel');
const mongoose = require('mongoose');
const CacheHelper = require('../utils/CacheHelper');
const moment = require('moment');
const AdminAnalytics = require('../utils/adminAnalytics');
const { AdminLogger, AdminLog } = require('../utils/adminLogger');
const AdminDashboardHelper = require('../utils/adminDashboardHelper');
const AdminCSVExporter = require('../utils/adminCSVExporter');
const AdminNotificationSystem = require('../utils/adminNotificationSystem');
const AdminScheduledReports = require('../utils/adminScheduledReports');

// Initialize utility classes
const csvExporter = new AdminCSVExporter();
const notificationSystem = new AdminNotificationSystem();
const scheduledReports = new AdminScheduledReports();

// Middleware to check admin authorization
const checkAdminAuth = (req, res, next) => {
    try {
        if (!req.headers['x-user']) {
            return res.status(400).json({ error: 'Missing x-user header' });
        }

        const currentUser = JSON.parse(req.headers['x-user']);
        if (!currentUser || !currentUser.data || !currentUser.data.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const role = currentUser.data.user.role;
        if (role !== 'admin' && role !== 'superadmin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.user = currentUser.data.user;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        return res.status(401).json({ error: 'Invalid user data' });
    }
};

// Apply logging middleware to all admin routes
const adminLogMiddleware = AdminLogger.createLogMiddleware();

// Dashboard Overview - Main analytics
exports.getDashboardOverview = [checkAdminAuth, async (req, res) => {
    try {
        const cacheKey = 'admin:dashboard:overview';
        const cached = await CacheHelper.get(cacheKey);

        if (cached) {
            return res.json({ success: true, data: cached });
        }

        // Aggregate room statistics
        const totalRooms = await Room.countDocuments();
        const totalBeds = await Room.aggregate([
            { $group: { _id: null, total: { $sum: '$totalBeds' } } }
        ]);

        const occupancyStats = await Room.aggregate([
            { $unwind: '$beds' },
            {
                $group: {
                    _id: '$beds.status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const roomsByType = await Room.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    totalBeds: { $sum: '$totalBeds' }
                }
            }
        ]);

        const roomsByStatus = await Room.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Calculate occupancy rate
        const occupiedBeds = occupancyStats.find(stat => stat._id === 'occupied')?.count || 0;
        const totalBedsCount = totalBeds[0]?.total || 0;
        const occupancyRate = totalBedsCount > 0 ? ((occupiedBeds / totalBedsCount) * 100).toFixed(2) : 0;

        // Recent activity (rooms created in last 30 days)
        const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
        const recentRooms = await Room.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        const overview = {
            totalRooms,
            totalBeds: totalBedsCount,
            occupiedBeds,
            vacantBeds: totalBedsCount - occupiedBeds,
            occupancyRate: parseFloat(occupancyRate),
            recentRooms,
            roomsByType,
            roomsByStatus,
            occupancyStats,
            lastUpdated: new Date()
        };

        // Cache for 5 minutes
        await CacheHelper.set(cacheKey, JSON.stringify(overview), 300);

        res.json({ success: true, data: overview });

    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard overview' });
    }
}];

// Get all rooms with pagination and filters
exports.getAllRooms = [checkAdminAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Build filter query
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.type) filter.type = req.query.type;
        if (req.query.propertyId) filter.propertyId = req.query.propertyId;
        if (req.query.floor) filter.floor = parseInt(req.query.floor);

        // Search functionality
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filter.$or = [
                { pgpalId: searchRegex },
                { roomNumber: parseInt(req.query.search) || 0 }
            ];
        }

        const rooms = await Room.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalRooms = await Room.countDocuments(filter);
        const totalPages = Math.ceil(totalRooms / limit);

        res.json({
            success: true,
            data: {
                rooms,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalRooms,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get all rooms error:', error);
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
}];

// Property-wise analytics
exports.getPropertyAnalytics = [checkAdminAuth, async (req, res) => {
    try {
        const cacheKey = 'admin:property:analytics';
        const cached = await CacheHelper.get(cacheKey);

        if (cached) {
            return res.json({ success: true, data: cached });
        }

        const propertyStats = await Room.aggregate([
            {
                $group: {
                    _id: '$propertyId',
                    totalRooms: { $sum: 1 },
                    totalBeds: { $sum: '$totalBeds' },
                    avgRentPerBed: { $avg: '$rentPerBed' },
                    roomTypes: { $addToSet: '$type' },
                    floors: { $addToSet: '$floor' }
                }
            },
            {
                $lookup: {
                    from: 'properties', // Assuming you have a properties collection
                    localField: '_id',
                    foreignField: '_id',
                    as: 'propertyInfo'
                }
            },
            { $sort: { totalRooms: -1 } }
        ]);

        // Get occupancy by property
        const propertyOccupancy = await Room.aggregate([
            { $unwind: '$beds' },
            {
                $group: {
                    _id: {
                        propertyId: '$propertyId',
                        status: '$beds.status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.propertyId',
                    occupancyDetails: {
                        $push: {
                            status: '$_id.status',
                            count: '$count'
                        }
                    }
                }
            }
        ]);

        // Combine stats with occupancy
        const enrichedStats = propertyStats.map(property => {
            const occupancy = propertyOccupancy.find(
                occ => occ._id.toString() === property._id.toString()
            );

            let occupiedBeds = 0;
            let vacantBeds = 0;

            if (occupancy) {
                occupiedBeds = occupancy.occupancyDetails.find(d => d.status === 'occupied')?.count || 0;
                vacantBeds = occupancy.occupancyDetails.find(d => d.status === 'vacant')?.count || 0;
            }

            const occupancyRate = property.totalBeds > 0 ?
                ((occupiedBeds / property.totalBeds) * 100).toFixed(2) : 0;

            return {
                ...property,
                occupiedBeds,
                vacantBeds,
                occupancyRate: parseFloat(occupancyRate),
                revenue: occupiedBeds * property.avgRentPerBed
            };
        });

        // Cache for 10 minutes
        await CacheHelper.set(cacheKey, JSON.stringify(enrichedStats), 600);

        res.json({ success: true, data: enrichedStats });

    } catch (error) {
        console.error('Property analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch property analytics' });
    }
}];

// Revenue analytics
exports.getRevenueAnalytics = [checkAdminAuth, async (req, res) => {
    try {
        const cacheKey = 'admin:revenue:analytics';
        const cached = await CacheHelper.get(cacheKey);

        if (cached) {
            return res.json({ success: true, data: cached });
        }

        // Calculate potential and actual revenue
        const revenueData = await Room.aggregate([
            { $unwind: '$beds' },
            {
                $group: {
                    _id: {
                        propertyId: '$propertyId',
                        roomType: '$type',
                        status: '$beds.status'
                    },
                    count: { $sum: 1 },
                    rentPerBed: { $first: '$rentPerBed' }
                }
            },
            {
                $group: {
                    _id: {
                        propertyId: '$_id.propertyId',
                        roomType: '$_id.roomType'
                    },
                    totalBeds: { $sum: '$count' },
                    occupiedBeds: {
                        $sum: {
                            $cond: [{ $eq: ['$_id.status', 'occupied'] }, '$count', 0]
                        }
                    },
                    rentPerBed: { $first: '$rentPerBed' }
                }
            },
            {
                $group: {
                    _id: '$_id.propertyId',
                    roomTypes: {
                        $push: {
                            type: '$_id.roomType',
                            totalBeds: '$totalBeds',
                            occupiedBeds: '$occupiedBeds',
                            rentPerBed: '$rentPerBed',
                            actualRevenue: { $multiply: ['$occupiedBeds', '$rentPerBed'] },
                            potentialRevenue: { $multiply: ['$totalBeds', '$rentPerBed'] }
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalActualRevenue: { $sum: '$roomTypes.actualRevenue' },
                    totalPotentialRevenue: { $sum: '$roomTypes.potentialRevenue' }
                }
            }
        ]);

        // Calculate overall totals
        const overallRevenue = revenueData.reduce((acc, property) => {
            acc.totalActual += property.totalActualRevenue;
            acc.totalPotential += property.totalPotentialRevenue;
            return acc;
        }, { totalActual: 0, totalPotential: 0 });

        const revenueEfficiency = overallRevenue.totalPotential > 0 ?
            ((overallRevenue.totalActual / overallRevenue.totalPotential) * 100).toFixed(2) : 0;

        const analytics = {
            propertyRevenue: revenueData,
            overallRevenue,
            revenueEfficiency: parseFloat(revenueEfficiency),
            lastUpdated: new Date()
        };

        // Cache for 15 minutes
        await CacheHelper.set(cacheKey, JSON.stringify(analytics), 900);

        res.json({ success: true, data: analytics });

    } catch (error) {
        console.error('Revenue analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch revenue analytics' });
    }
}];

// System health and monitoring
exports.getSystemHealth = [checkAdminAuth, async (req, res) => {
    try {
        // Database health
        const dbStats = await mongoose.connection.db.stats();
        const roomCollectionStats = await Room.collection.stats();

        // Redis health
        let redisHealth = 'unknown';
        try {
            await CacheHelper.ping();
            redisHealth = 'healthy';
        } catch (error) {
            redisHealth = 'unhealthy';
        }

        // Recent activity metrics
        const last24Hours = moment().subtract(24, 'hours').toDate();
        const recentActivity = {
            roomsCreated: await Room.countDocuments({ createdAt: { $gte: last24Hours } }),
            roomsUpdated: await Room.countDocuments({ updatedAt: { $gte: last24Hours } })
        };

        const healthData = {
            database: {
                status: 'healthy',
                collections: dbStats.collections,
                dataSize: dbStats.dataSize,
                storageSize: dbStats.storageSize,
                indexes: dbStats.indexes
            },
            roomCollection: {
                count: roomCollectionStats.count,
                size: roomCollectionStats.size,
                avgObjSize: roomCollectionStats.avgObjSize
            },
            redis: {
                status: redisHealth
            },
            recentActivity,
            serverTime: new Date(),
            uptime: process.uptime()
        };

        res.json({ success: true, data: healthData });

    } catch (error) {
        console.error('System health error:', error);
        res.status(500).json({ error: 'Failed to fetch system health' });
    }
}];

// Search and filter rooms with advanced options
exports.searchRooms = [checkAdminAuth, async (req, res) => {
    try {
        const {
            search,
            propertyId,
            status,
            type,
            floor,
            minRent,
            maxRent,
            bedStatus,
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const filter = {};
        const sort = {};

        // Build filter query
        if (propertyId) filter.propertyId = mongoose.Types.ObjectId(propertyId);
        if (status) filter.status = status;
        if (type) filter.type = type;
        if (floor) filter.floor = parseInt(floor);
        if (minRent || maxRent) {
            filter.rentPerBed = {};
            if (minRent) filter.rentPerBed.$gte = parseInt(minRent);
            if (maxRent) filter.rentPerBed.$lte = parseInt(maxRent);
        }

        // Search functionality
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filter.$or = [
                { pgpalId: searchRegex },
                { roomNumber: isNaN(search) ? 0 : parseInt(search) }
            ];
        }

        // Bed status filter
        if (bedStatus) {
            filter['beds.status'] = bedStatus;
        }

        // Sort configuration
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const rooms = await Room.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const totalRooms = await Room.countDocuments(filter);
        const totalPages = Math.ceil(totalRooms / parseInt(limit));

        res.json({
            success: true,
            data: {
                rooms,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalRooms,
                    hasNextPage: parseInt(page) < totalPages,
                    hasPrevPage: parseInt(page) > 1
                },
                filters: {
                    search,
                    propertyId,
                    status,
                    type,
                    floor,
                    minRent,
                    maxRent,
                    bedStatus
                }
            }
        });

    } catch (error) {
        console.error('Search rooms error:', error);
        res.status(500).json({ error: 'Failed to search rooms' });
    }
}];

// Bulk operations
exports.bulkUpdateRooms = [checkAdminAuth, async (req, res) => {
    try {
        const { roomIds, updates } = req.body;

        if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
            return res.status(400).json({ error: 'Room IDs array is required' });
        }

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Updates object is required' });
        }

        // Validate room IDs
        const validRoomIds = roomIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validRoomIds.length !== roomIds.length) {
            return res.status(400).json({ error: 'Invalid room ID(s) provided' });
        }

        // Prepare update object
        const updateObject = { ...updates, updatedAt: new Date() };

        const result = await Room.updateMany(
            { _id: { $in: validRoomIds } },
            { $set: updateObject }
        );

        // Clear relevant cache
        await CacheHelper.del('admin:dashboard:overview');
        await CacheHelper.del('admin:property:analytics');

        res.json({
            success: true,
            data: {
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                updatedRooms: validRoomIds
            }
        });

    } catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({ error: 'Failed to update rooms' });
    }
}];

// Export analytics data
exports.exportData = [checkAdminAuth, async (req, res) => {
    try {
        const { format = 'json', type = 'all', timeframe = '30d', groupBy = 'property' } = req.query;

        if (format === 'csv') {
            let csvResult;

            switch (type) {
                case 'rooms':
                    csvResult = await csvExporter.exportRoomsToCSV();
                    break;
                case 'analytics':
                    csvResult = await csvExporter.exportAnalyticsToCSV(timeframe, groupBy);
                    break;
                case 'logs':
                    csvResult = await csvExporter.exportLogsToCSV();
                    break;
                case 'occupancy-trends':
                    csvResult = await csvExporter.exportOccupancyTrendsToCSV(timeframe);
                    break;
                case 'property-comparison':
                    csvResult = await csvExporter.exportPropertyComparisonToCSV();
                    break;
                case 'comprehensive':
                    csvResult = await csvExporter.exportComprehensiveReportToCSV(timeframe);
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid export type for CSV format' });
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${csvResult.fileName}"`);

            return res.json({
                success: true,
                message: 'CSV export generated successfully',
                export: csvResult
            });
        }

        // JSON export (existing functionality)
        let data = {};

        switch (type) {
            case 'rooms':
                data.rooms = await Room.find({}).lean();
                break;
            case 'analytics':
                const analytics = await AdminDashboardHelper.getDetailedRevenue(timeframe, groupBy);
                data.analytics = analytics;
                break;
            case 'logs':
                const logs = await AdminLog.find({}).sort({ timestamp: -1 }).limit(1000).lean();
                data.logs = logs;
                break;
            default:
                data.rooms = await Room.find({}).lean();
                data.summary = await Room.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalRooms: { $sum: 1 },
                            totalBeds: { $sum: '$totalBeds' },
                            avgRent: { $avg: '$rentPerBed' }
                        }
                    }
                ]);
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=room-data-${type}.json`);
        res.json({
            success: true,
            exportedAt: new Date(),
            type,
            format,
            data
        });

    } catch (error) {
        console.error('Export data error:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
}];

// Get export files list
exports.getExportFiles = [checkAdminAuth, async (req, res) => {
    try {
        const files = csvExporter.getExportFiles();

        res.json({
            success: true,
            data: {
                files,
                totalFiles: files.length,
                totalSize: files.reduce((acc, file) => acc + file.size, 0)
            }
        });

    } catch (error) {
        console.error('Get export files error:', error);
        res.status(500).json({ error: 'Failed to get export files' });
    }
}];

// Download export file
exports.downloadExportFile = [checkAdminAuth, async (req, res) => {
    try {
        const { fileName } = req.params;

        if (!fileName || !fileName.endsWith('.csv')) {
            return res.status(400).json({ error: 'Invalid file name' });
        }

        const fileData = csvExporter.getExportFile(fileName);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(fileData.content);

    } catch (error) {
        console.error('Download export file error:', error);
        if (error.message === 'Export file not found') {
            res.status(404).json({ error: 'File not found' });
        } else {
            res.status(500).json({ error: 'Failed to download file' });
        }
    }
}];

// Send test notification
exports.sendTestNotification = [checkAdminAuth, async (req, res) => {
    try {
        await notificationSystem.testNotifications();

        res.json({
            success: true,
            message: 'Test notification sent successfully'
        });

    } catch (error) {
        console.error('Send test notification error:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
}];

// Get scheduled reports status
exports.getScheduledReportsStatus = [checkAdminAuth, async (req, res) => {
    try {
        const status = scheduledReports.getJobStatus();

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('Get scheduled reports status error:', error);
        res.status(500).json({ error: 'Failed to get scheduled reports status' });
    }
}];

// Trigger manual report generation
exports.generateManualReport = [checkAdminAuth, async (req, res) => {
    try {
        const { reportType, timeframe, format = 'json' } = req.body;

        if (!reportType) {
            return res.status(400).json({ error: 'Report type is required' });
        }

        let reportData = {};

        switch (reportType) {
            case 'occupancy':
                reportData = await generateOccupancyReport(timeframe);
                break;
            case 'revenue':
                reportData = await generateRevenueReport(timeframe);
                break;
            case 'activity':
                reportData = await generateActivityReport(timeframe);
                break;
            case 'property':
                reportData = await generatePropertyReport(timeframe);
                break;
            default:
                return res.status(400).json({ error: 'Invalid report type' });
        }

        await AdminLogger.logActivity(req.user._id, 'POST /reports/generate', 'reports', {
            reportType, timeframe, format
        });

        res.json({
            success: true,
            reportType,
            timeframe,
            format,
            generatedAt: new Date(),
            data: reportData
        });

    } catch (error) {
        console.error('Generate manual report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
}];

// Helper functions for report generation
async function generateOccupancyReport(timeframe) {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeframe) {
        case '7d':
            startDate.setDate(endDate.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(endDate.getDate() - 30);
            break;
        case '90d':
            startDate.setDate(endDate.getDate() - 90);
            break;
        default:
            startDate.setDate(endDate.getDate() - 30);
    }

    const occupancyData = await Room.aggregate([
        { $unwind: '$beds' },
        {
            $group: {
                _id: {
                    propertyId: '$propertyId',
                    status: '$beds.status'
                },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.propertyId',
                statusCounts: {
                    $push: {
                        status: '$_id.status',
                        count: '$count'
                    }
                },
                totalBeds: { $sum: '$count' }
            }
        }
    ]);

    return {
        timeframe,
        startDate,
        endDate,
        occupancyData,
        summary: {
            totalProperties: occupancyData.length,
            totalBeds: occupancyData.reduce((sum, prop) => sum + prop.totalBeds, 0)
        }
    };
}

async function generateRevenueReport(timeframe) {
    const revenueData = await Room.aggregate([
        { $unwind: '$beds' },
        {
            $match: {
                'beds.status': 'occupied'
            }
        },
        {
            $group: {
                _id: '$propertyId',
                occupiedBeds: { $sum: 1 },
                totalRevenue: { $sum: '$rentPerBed' },
                avgRentPerBed: { $avg: '$rentPerBed' }
            }
        }
    ]);

    const totalRevenue = revenueData.reduce((sum, prop) => sum + prop.totalRevenue, 0);

    return {
        timeframe,
        revenueData,
        summary: {
            totalRevenue,
            avgRevenuePerProperty: revenueData.length > 0 ? totalRevenue / revenueData.length : 0,
            totalOccupiedBeds: revenueData.reduce((sum, prop) => sum + prop.occupiedBeds, 0)
        }
    };
}

async function generateActivityReport(timeframe) {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeframe) {
        case '7d':
            startDate.setDate(endDate.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(endDate.getDate() - 30);
            break;
        default:
            startDate.setDate(endDate.getDate() - 30);
    }

    const AdminLog = require('../models/AdminLog');

    const activityData = await AdminLog.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    action: '$action',
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
                },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.action',
                dailyCounts: {
                    $push: {
                        date: '$_id.date',
                        count: '$count'
                    }
                },
                totalCount: { $sum: '$count' }
            }
        }
    ]);

    return {
        timeframe,
        startDate,
        endDate,
        activityData,
        summary: {
            totalActions: activityData.reduce((sum, action) => sum + action.totalCount, 0),
            uniqueActions: activityData.length
        }
    };
}

async function generatePropertyReport(timeframe) {
    const propertyData = await Room.aggregate([
        {
            $group: {
                _id: '$propertyId',
                totalRooms: { $sum: 1 },
                totalBeds: { $sum: '$totalBeds' },
                avgRentPerBed: { $avg: '$rentPerBed' },
                roomTypes: { $addToSet: '$type' },
                floors: { $max: '$floor' }
            }
        }
    ]);

    return {
        timeframe,
        propertyData,
        summary: {
            totalProperties: propertyData.length,
            totalRooms: propertyData.reduce((sum, prop) => sum + prop.totalRooms, 0),
            totalBeds: propertyData.reduce((sum, prop) => sum + prop.totalBeds, 0),
            avgRentAcrossAll: propertyData.reduce((sum, prop) => sum + prop.avgRentPerBed, 0) / propertyData.length
        }
    };
}

// Get Advanced Dashboard
exports.getAdvancedDashboard = [checkAdminAuth, async (req, res) => {
    try {
        const { timeframe = '30d', groupBy = 'property' } = req.query;

        const dashboardData = await AdminDashboardHelper.getAdvancedDashboard({
            timeframe,
            groupBy,
            includeComparisons: true,
            includeTrends: true
        });

        await AdminLogger.logActivity(req.user._id, 'GET /dashboard/advanced', 'dashboard', {
            timeframe, groupBy
        });

        res.json({
            success: true,
            timeframe,
            groupBy,
            data: dashboardData,
            generatedAt: new Date()
        });

    } catch (error) {
        console.error('Get advanced dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch advanced dashboard data' });
    }
}];

// Get Comprehensive Dashboard
exports.getComprehensiveDashboard = [checkAdminAuth, async (req, res) => {
    try {
        const { includeAnalytics = true, includeInsights = true } = req.query;

        const comprehensiveData = await AdminDashboardHelper.getComprehensiveDashboard({
            includeAnalytics: includeAnalytics === 'true',
            includeInsights: includeInsights === 'true',
            includeForecasts: true
        });

        await AdminLogger.logActivity(req.user._id, 'GET /dashboard/comprehensive', 'dashboard', {
            includeAnalytics, includeInsights
        });

        res.json({
            success: true,
            data: comprehensiveData,
            generatedAt: new Date()
        });

    } catch (error) {
        console.error('Get comprehensive dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch comprehensive dashboard data' });
    }
}];

// Get Advanced Analytics
exports.getAdvancedAnalytics = [checkAdminAuth, async (req, res) => {
    try {
        const {
            timeframe = '30d',
            metrics = ['occupancy', 'revenue'],
            groupBy = 'property',
            includeComparisons = true
        } = req.query;

        const analyticsData = await AdminAnalytics.getAdvancedAnalytics({
            timeframe,
            metrics: Array.isArray(metrics) ? metrics : [metrics],
            groupBy,
            includeComparisons: includeComparisons === 'true'
        });

        await AdminLogger.logActivity(req.user._id, 'GET /analytics/advanced', 'analytics', {
            timeframe, metrics, groupBy
        });

        res.json({
            success: true,
            timeframe,
            metrics,
            groupBy,
            data: analyticsData,
            generatedAt: new Date()
        });

    } catch (error) {
        console.error('Get advanced analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch advanced analytics' });
    }
}];

// Get Performance Insights
exports.getPerformanceInsights = [checkAdminAuth, async (req, res) => {
    try {
        const { timeframe = '30d' } = req.query;

        const insights = await AdminAnalytics.getPerformanceInsights(timeframe);

        await AdminLogger.logActivity(req.user._id, 'GET /analytics/insights', 'analytics', {
            timeframe
        });

        res.json({
            success: true,
            timeframe,
            data: insights,
            generatedAt: new Date()
        });

    } catch (error) {
        console.error('Get performance insights error:', error);
        res.status(500).json({ error: 'Failed to fetch performance insights' });
    }
}];

// Get Occupancy Forecast
exports.getOccupancyForecast = [checkAdminAuth, async (req, res) => {
    try {
        const {
            period = '30d',
            propertyId = null,
            includeConfidenceInterval = true
        } = req.query;

        const forecast = await AdminAnalytics.getOccupancyForecast({
            period,
            propertyId,
            includeConfidenceInterval: includeConfidenceInterval === 'true'
        });

        await AdminLogger.logActivity(req.user._id, 'GET /analytics/forecast', 'analytics', {
            period, propertyId
        });

        res.json({
            success: true,
            period,
            propertyId,
            data: forecast,
            generatedAt: new Date()
        });

    } catch (error) {
        console.error('Get occupancy forecast error:', error);
        res.status(500).json({ error: 'Failed to fetch occupancy forecast' });
    }
}];