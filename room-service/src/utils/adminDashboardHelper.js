const Room = require('../models/roomModel');
const mongoose = require('mongoose');
const moment = require('moment');
const AdminAnalytics = require('./adminAnalytics');
const CacheHelper = require('./redis');

class AdminDashboardHelper {

    // Generate comprehensive room statistics
    static async getRoomStatistics(filters = {}) {
        try {
            const pipeline = [
                { $match: filters },
                {
                    $facet: {
                        // Basic counts
                        basicStats: [
                            {
                                $group: {
                                    _id: null,
                                    totalRooms: { $sum: 1 },
                                    totalBeds: { $sum: '$totalBeds' },
                                    avgRentPerBed: { $avg: '$rentPerBed' },
                                    minRent: { $min: '$rentPerBed' },
                                    maxRent: { $max: '$rentPerBed' }
                                }
                            }
                        ],

                        // Room status distribution
                        statusDistribution: [
                            {
                                $group: {
                                    _id: '$status',
                                    count: { $sum: 1 }
                                }
                            }
                        ],

                        // Room type distribution
                        typeDistribution: [
                            {
                                $group: {
                                    _id: '$type',
                                    count: { $sum: 1 },
                                    totalBeds: { $sum: '$totalBeds' },
                                    avgRent: { $avg: '$rentPerBed' }
                                }
                            }
                        ],

                        // Floor distribution
                        floorDistribution: [
                            {
                                $group: {
                                    _id: '$floor',
                                    count: { $sum: 1 },
                                    totalBeds: { $sum: '$totalBeds' }
                                }
                            },
                            { $sort: { '_id': 1 } }
                        ],

                        // Property distribution
                        propertyDistribution: [
                            {
                                $group: {
                                    _id: '$propertyId',
                                    roomCount: { $sum: 1 },
                                    bedCount: { $sum: '$totalBeds' },
                                    avgRent: { $avg: '$rentPerBed' }
                                }
                            },
                            { $sort: { roomCount: -1 } }
                        ],

                        // Bed occupancy statistics
                        bedOccupancy: [
                            { $unwind: '$beds' },
                            {
                                $group: {
                                    _id: '$beds.status',
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                }
            ];

            const result = await Room.aggregate(pipeline);
            return result[0] || {};

        } catch (error) {
            console.error('Error generating room statistics:', error);
            throw error;
        }
    }

    // Get revenue analytics with detailed breakdown
    static async getDetailedRevenue(timeframe = '30d', groupBy = 'property') {
        try {
            const timeQuery = AdminAnalytics.generateTimeBasedQuery(timeframe);

            let groupField;
            switch (groupBy) {
                case 'property':
                    groupField = '$propertyId';
                    break;
                case 'type':
                    groupField = '$type';
                    break;
                case 'floor':
                    groupField = '$floor';
                    break;
                case 'month':
                    groupField = {
                        $dateToString: {
                            format: '%Y-%m',
                            date: '$createdAt'
                        }
                    };
                    break;
                default:
                    groupField = '$propertyId';
            }

            const pipeline = [
                { $match: timeQuery },
                { $unwind: '$beds' },
                {
                    $group: {
                        _id: {
                            group: groupField,
                            bedStatus: '$beds.status'
                        },
                        bedCount: { $sum: 1 },
                        rentPerBed: { $first: '$rentPerBed' }
                    }
                },
                {
                    $group: {
                        _id: '$_id.group',
                        beds: {
                            $push: {
                                status: '$_id.bedStatus',
                                count: '$bedCount',
                                rentPerBed: '$rentPerBed'
                            }
                        },
                        totalBeds: { $sum: '$bedCount' }
                    }
                },
                {
                    $addFields: {
                        occupiedBeds: {
                            $reduce: {
                                input: '$beds',
                                initialValue: 0,
                                in: {
                                    $cond: [
                                        { $eq: ['$$this.status', 'occupied'] },
                                        { $add: ['$$value', '$$this.count'] },
                                        '$$value'
                                    ]
                                }
                            }
                        },
                        avgRentPerBed: {
                            $avg: '$beds.rentPerBed'
                        }
                    }
                },
                {
                    $addFields: {
                        currentRevenue: { $multiply: ['$occupiedBeds', '$avgRentPerBed'] },
                        potentialRevenue: { $multiply: ['$totalBeds', '$avgRentPerBed'] },
                        occupancyRate: {
                            $cond: [
                                { $gt: ['$totalBeds', 0] },
                                { $multiply: [{ $divide: ['$occupiedBeds', '$totalBeds'] }, 100] },
                                0
                            ]
                        }
                    }
                },
                { $sort: { currentRevenue: -1 } }
            ];

            return await Room.aggregate(pipeline);

        } catch (error) {
            console.error('Error generating revenue analytics:', error);
            throw error;
        }
    }

    // Get occupancy trends over time
    static async getOccupancyTrends(timeframe = '30d', granularity = 'day') {
        try {
            const timeQuery = AdminAnalytics.generateTimeBasedQuery(timeframe);

            let dateFormat;
            switch (granularity) {
                case 'hour':
                    dateFormat = '%Y-%m-%d %H:00';
                    break;
                case 'day':
                    dateFormat = '%Y-%m-%d';
                    break;
                case 'week':
                    dateFormat = '%Y-W%U';
                    break;
                case 'month':
                    dateFormat = '%Y-%m';
                    break;
                default:
                    dateFormat = '%Y-%m-%d';
            }

            const pipeline = [
                { $match: timeQuery },
                { $unwind: '$beds' },
                {
                    $group: {
                        _id: {
                            date: {
                                $dateToString: {
                                    format: dateFormat,
                                    date: '$updatedAt'
                                }
                            },
                            status: '$beds.status'
                        },
                        count: { $sum: 1 }
                    }
                },
                {
                    $group: {
                        _id: '$_id.date',
                        statuses: {
                            $push: {
                                status: '$_id.status',
                                count: '$count'
                            }
                        },
                        totalBeds: { $sum: '$count' }
                    }
                },
                {
                    $addFields: {
                        occupiedCount: {
                            $reduce: {
                                input: '$statuses',
                                initialValue: 0,
                                in: {
                                    $cond: [
                                        { $eq: ['$$this.status', 'occupied'] },
                                        { $add: ['$$value', '$$this.count'] },
                                        '$$value'
                                    ]
                                }
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        occupancyRate: {
                            $cond: [
                                { $gt: ['$totalBeds', 0] },
                                { $multiply: [{ $divide: ['$occupiedCount', '$totalBeds'] }, 100] },
                                0
                            ]
                        }
                    }
                },
                { $sort: { '_id': 1 } }
            ];

            return await Room.aggregate(pipeline);

        } catch (error) {
            console.error('Error generating occupancy trends:', error);
            throw error;
        }
    }

    // Get property performance comparison
    static async getPropertyComparison() {
        try {
            const cacheKey = 'admin:property:comparison';
            const cached = await CacheHelper.get(cacheKey);

            if (cached) {
                return JSON.parse(cached);
            }

            const pipeline = [
                {
                    $group: {
                        _id: '$propertyId',
                        totalRooms: { $sum: 1 },
                        totalBeds: { $sum: '$totalBeds' },
                        avgRent: { $avg: '$rentPerBed' },
                        minRent: { $min: '$rentPerBed' },
                        maxRent: { $max: '$rentPerBed' },
                        roomTypes: { $addToSet: '$type' },
                        floors: { $addToSet: '$floor' }
                    }
                },
                {
                    $lookup: {
                        from: 'rooms',
                        let: { propertyId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$propertyId', '$$propertyId'] } } },
                            { $unwind: '$beds' },
                            {
                                $group: {
                                    _id: '$beds.status',
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        as: 'bedOccupancy'
                    }
                },
                {
                    $addFields: {
                        occupiedBeds: {
                            $reduce: {
                                input: '$bedOccupancy',
                                initialValue: 0,
                                in: {
                                    $cond: [
                                        { $eq: ['$$this._id', 'occupied'] },
                                        { $add: ['$$value', '$$this.count'] },
                                        '$$value'
                                    ]
                                }
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        occupancyRate: {
                            $cond: [
                                { $gt: ['$totalBeds', 0] },
                                { $multiply: [{ $divide: ['$occupiedBeds', '$totalBeds'] }, 100] },
                                0
                            ]
                        },
                        currentRevenue: { $multiply: ['$occupiedBeds', '$avgRent'] },
                        potentialRevenue: { $multiply: ['$totalBeds', '$avgRent'] }
                    }
                },
                {
                    $addFields: {
                        revenueEfficiency: {
                            $cond: [
                                { $gt: ['$potentialRevenue', 0] },
                                { $multiply: [{ $divide: ['$currentRevenue', '$potentialRevenue'] }, 100] },
                                0
                            ]
                        }
                    }
                },
                { $sort: { currentRevenue: -1 } }
            ];

            const result = await Room.aggregate(pipeline);

            // Cache for 15 minutes
            await CacheHelper.setWithExpiry(cacheKey, JSON.stringify(result), 900);

            return result;

        } catch (error) {
            console.error('Error generating property comparison:', error);
            throw error;
        }
    }

    // Get top performing rooms/properties
    static async getTopPerformers(metric = 'revenue', limit = 10) {
        try {
            let sortField;
            let pipeline = [];

            switch (metric) {
                case 'revenue':
                    pipeline = [
                        { $unwind: '$beds' },
                        {
                            $group: {
                                _id: '$_id',
                                roomNumber: { $first: '$roomNumber' },
                                propertyId: { $first: '$propertyId' },
                                type: { $first: '$type' },
                                floor: { $first: '$floor' },
                                totalBeds: { $first: '$totalBeds' },
                                rentPerBed: { $first: '$rentPerBed' },
                                occupiedBeds: {
                                    $sum: {
                                        $cond: [{ $eq: ['$beds.status', 'occupied'] }, 1, 0]
                                    }
                                }
                            }
                        },
                        {
                            $addFields: {
                                currentRevenue: { $multiply: ['$occupiedBeds', '$rentPerBed'] },
                                potentialRevenue: { $multiply: ['$totalBeds', '$rentPerBed'] },
                                occupancyRate: {
                                    $cond: [
                                        { $gt: ['$totalBeds', 0] },
                                        { $multiply: [{ $divide: ['$occupiedBeds', '$totalBeds'] }, 100] },
                                        0
                                    ]
                                }
                            }
                        }
                    ];
                    sortField = { currentRevenue: -1 };
                    break;

                case 'occupancy':
                    pipeline = [
                        { $unwind: '$beds' },
                        {
                            $group: {
                                _id: '$_id',
                                roomNumber: { $first: '$roomNumber' },
                                propertyId: { $first: '$propertyId' },
                                type: { $first: '$type' },
                                floor: { $first: '$floor' },
                                totalBeds: { $first: '$totalBeds' },
                                occupiedBeds: {
                                    $sum: {
                                        $cond: [{ $eq: ['$beds.status', 'occupied'] }, 1, 0]
                                    }
                                }
                            }
                        },
                        {
                            $addFields: {
                                occupancyRate: {
                                    $cond: [
                                        { $gt: ['$totalBeds', 0] },
                                        { $multiply: [{ $divide: ['$occupiedBeds', '$totalBeds'] }, 100] },
                                        0
                                    ]
                                }
                            }
                        }
                    ];
                    sortField = { occupancyRate: -1 };
                    break;

                case 'rent':
                    pipeline = [];
                    sortField = { rentPerBed: -1 };
                    break;

                default:
                    sortField = { rentPerBed: -1 };
            }

            pipeline.push(
                { $sort: sortField },
                { $limit: limit }
            );

            return await Room.aggregate(pipeline);

        } catch (error) {
            console.error('Error getting top performers:', error);
            throw error;
        }
    }

    // Generate alert conditions
    static async checkAlertConditions() {
        try {
            const alerts = [];

            // Check for low occupancy properties
            const lowOccupancyThreshold = 30; // 30%
            const lowOccupancyProperties = await Room.aggregate([
                { $unwind: '$beds' },
                {
                    $group: {
                        _id: '$propertyId',
                        totalBeds: { $sum: 1 },
                        occupiedBeds: {
                            $sum: {
                                $cond: [{ $eq: ['$beds.status', 'occupied'] }, 1, 0]
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        occupancyRate: {
                            $multiply: [{ $divide: ['$occupiedBeds', '$totalBeds'] }, 100]
                        }
                    }
                },
                { $match: { occupancyRate: { $lt: lowOccupancyThreshold } } }
            ]);

            lowOccupancyProperties.forEach(property => {
                alerts.push({
                    type: 'low-occupancy',
                    severity: 'warning',
                    propertyId: property._id,
                    occupancyRate: property.occupancyRate,
                    message: `Property has low occupancy rate: ${property.occupancyRate.toFixed(1)}%`
                });
            });

            // Check for high occupancy (above 95%)
            const highOccupancyThreshold = 95;
            const highOccupancyProperties = await Room.aggregate([
                { $unwind: '$beds' },
                {
                    $group: {
                        _id: '$propertyId',
                        totalBeds: { $sum: 1 },
                        occupiedBeds: {
                            $sum: {
                                $cond: [{ $eq: ['$beds.status', 'occupied'] }, 1, 0]
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        occupancyRate: {
                            $multiply: [{ $divide: ['$occupiedBeds', '$totalBeds'] }, 100]
                        }
                    }
                },
                { $match: { occupancyRate: { $gt: highOccupancyThreshold } } }
            ]);

            highOccupancyProperties.forEach(property => {
                alerts.push({
                    type: 'high-occupancy',
                    severity: 'info',
                    propertyId: property._id,
                    occupancyRate: property.occupancyRate,
                    message: `Property is nearly full: ${property.occupancyRate.toFixed(1)}% occupied`
                });
            });

            // Check for rooms with no updates in 30 days
            const staleDataThreshold = moment().subtract(30, 'days').toDate();
            const staleRooms = await Room.countDocuments({
                updatedAt: { $lt: staleDataThreshold }
            });

            if (staleRooms > 0) {
                alerts.push({
                    type: 'stale-data',
                    severity: 'warning',
                    count: staleRooms,
                    message: `${staleRooms} rooms haven't been updated in 30+ days`
                });
            }

            return alerts;

        } catch (error) {
            console.error('Error checking alert conditions:', error);
            throw error;
        }
    }

    // Get advanced dashboard with custom grouping and metrics
    static async getAdvancedDashboard(options = {}) {
        try {
            const { groupBy = 'property', timeframe = '30d', metrics = ['occupancy', 'revenue'] } = options;

            const baseStats = await this.getRoomStatistics();
            const trends = await this.getTrends(timeframe);

            let groupedData = {};

            if (groupBy === 'property') {
                groupedData = await this.getPropertyGroupedData(metrics, timeframe);
            } else if (groupBy === 'type') {
                groupedData = await this.getTypeGroupedData(metrics, timeframe);
            } else if (groupBy === 'floor') {
                groupedData = await this.getFloorGroupedData(metrics, timeframe);
            } else if (groupBy === 'date') {
                groupedData = await this.getDateGroupedData(metrics, timeframe);
            }

            return {
                summary: baseStats,
                trends,
                groupedData,
                groupBy,
                timeframe,
                metrics,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Error generating advanced dashboard:', error);
            throw error;
        }
    }

    // Get comprehensive dashboard with all available data
    static async getComprehensiveDashboard() {
        try {
            const [
                roomStats,
                trends,
                propertyData,
                typeData,
                floorData,
                recentActivity,
                alerts
            ] = await Promise.all([
                this.getRoomStatistics(),
                this.getTrends('30d'),
                this.getPropertyGroupedData(['occupancy', 'revenue'], '30d'),
                this.getTypeGroupedData(['occupancy', 'revenue'], '30d'),
                this.getFloorGroupedData(['occupancy', 'revenue'], '30d'),
                this.getRecentActivity(10),
                this.checkAlertConditions()
            ]);

            return {
                overview: roomStats,
                trends,
                breakdowns: {
                    byProperty: propertyData,
                    byType: typeData,
                    byFloor: floorData
                },
                recentActivity,
                alerts,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Error generating comprehensive dashboard:', error);
            throw error;
        }
    }

    // Helper methods for advanced dashboard grouping
    static async getPropertyGroupedData(metrics, timeframe) {
        try {
            const pipeline = [
                {
                    $group: {
                        _id: '$propertyId',
                        totalRooms: { $sum: 1 },
                        totalBeds: { $sum: '$totalBeds' },
                        avgRent: { $avg: '$rentPerBed' },
                        occupiedBeds: {
                            $sum: {
                                $size: {
                                    $filter: {
                                        input: '$beds',
                                        cond: { $eq: ['$$this.status', 'occupied'] }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        occupancyRate: {
                            $multiply: [
                                { $divide: ['$occupiedBeds', '$totalBeds'] },
                                100
                            ]
                        },
                        estimatedRevenue: {
                            $multiply: ['$occupiedBeds', '$avgRent']
                        }
                    }
                }
            ];

            return await Room.aggregate(pipeline);
        } catch (error) {
            console.error('Error getting property grouped data:', error);
            return [];
        }
    }

    static async getTypeGroupedData(metrics, timeframe) {
        try {
            const pipeline = [
                {
                    $group: {
                        _id: '$type',
                        totalRooms: { $sum: 1 },
                        totalBeds: { $sum: '$totalBeds' },
                        avgRent: { $avg: '$rentPerBed' },
                        occupiedBeds: {
                            $sum: {
                                $size: {
                                    $filter: {
                                        input: '$beds',
                                        cond: { $eq: ['$$this.status', 'occupied'] }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        occupancyRate: {
                            $multiply: [
                                { $divide: ['$occupiedBeds', '$totalBeds'] },
                                100
                            ]
                        },
                        estimatedRevenue: {
                            $multiply: ['$occupiedBeds', '$avgRent']
                        }
                    }
                }
            ];

            return await Room.aggregate(pipeline);
        } catch (error) {
            console.error('Error getting type grouped data:', error);
            return [];
        }
    }

    static async getFloorGroupedData(metrics, timeframe) {
        try {
            const pipeline = [
                {
                    $group: {
                        _id: '$floor',
                        totalRooms: { $sum: 1 },
                        totalBeds: { $sum: '$totalBeds' },
                        avgRent: { $avg: '$rentPerBed' },
                        occupiedBeds: {
                            $sum: {
                                $size: {
                                    $filter: {
                                        input: '$beds',
                                        cond: { $eq: ['$$this.status', 'occupied'] }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        occupancyRate: {
                            $multiply: [
                                { $divide: ['$occupiedBeds', '$totalBeds'] },
                                100
                            ]
                        },
                        estimatedRevenue: {
                            $multiply: ['$occupiedBeds', '$avgRent']
                        }
                    }
                },
                { $sort: { '_id': 1 } }
            ];

            return await Room.aggregate(pipeline);
        } catch (error) {
            console.error('Error getting floor grouped data:', error);
            return [];
        }
    }

    static async getDateGroupedData(metrics, timeframe) {
        try {
            const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
            const dates = [];

            for (let i = 0; i < days; i++) {
                const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
                dates.push({
                    date,
                    // Mock data for date grouping - in real implementation,
                    // this would aggregate actual historical data
                    totalRooms: Math.floor(Math.random() * 100) + 50,
                    occupancyRate: Math.floor(Math.random() * 40) + 60,
                    revenue: Math.floor(Math.random() * 50000) + 30000
                });
            }

            return dates.reverse();
        } catch (error) {
            console.error('Error getting date grouped data:', error);
            return [];
        }
    }
}

module.exports = AdminDashboardHelper;
