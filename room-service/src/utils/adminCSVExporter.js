const fs = require('fs');
const path = require('path');
const moment = require('moment');
const AdminDashboardHelper = require('./adminDashboardHelper');
const AdminAnalytics = require('./adminAnalytics');
const { AdminLog } = require('./adminLogger');
const Room = require('../models/roomModel');

class AdminCSVExporter {
    constructor() {
        this.exportDir = path.join(__dirname, '../../exports');
        this.ensureExportDirectory();
    }

    // Ensure export directory exists
    ensureExportDirectory() {
        if (!fs.existsSync(this.exportDir)) {
            fs.mkdirSync(this.exportDir, { recursive: true });
        }
    }

    // Export rooms data to CSV
    async exportRoomsToCSV(filters = {}) {
        try {
            const rooms = await Room.find(filters).lean();

            const csvHeaders = [
                'Room ID',
                'Room Number',
                'Property ID',
                'Type',
                'Floor',
                'Total Beds',
                'Rent Per Bed',
                'Status',
                'Created At',
                'Updated At',
                'Occupied Beds',
                'Vacant Beds',
                'Current Revenue'
            ];

            const csvData = rooms.map(room => {
                const occupiedBeds = room.beds?.filter(bed => bed.status === 'occupied').length || 0;
                const vacantBeds = (room.totalBeds || 0) - occupiedBeds;
                const currentRevenue = occupiedBeds * (room.rentPerBed || 0);

                return [
                    room._id.toString(),
                    room.roomNumber || '',
                    room.propertyId?.toString() || '',
                    room.type || '',
                    room.floor || '',
                    room.totalBeds || 0,
                    room.rentPerBed || 0,
                    room.status || '',
                    moment(room.createdAt).format('YYYY-MM-DD HH:mm:ss'),
                    moment(room.updatedAt).format('YYYY-MM-DD HH:mm:ss'),
                    occupiedBeds,
                    vacantBeds,
                    currentRevenue
                ];
            });

            return this.generateCSV(csvHeaders, csvData, 'rooms');

        } catch (error) {
            console.error('Error exporting rooms to CSV:', error);
            throw error;
        }
    }

    // Export analytics data to CSV
    async exportAnalyticsToCSV(timeframe = '30d', groupBy = 'property') {
        try {
            const analytics = await AdminDashboardHelper.getDetailedRevenue(timeframe, groupBy);

            const csvHeaders = [
                'Group',
                'Total Beds',
                'Occupied Beds',
                'Vacant Beds',
                'Occupancy Rate (%)',
                'Current Revenue',
                'Potential Revenue',
                'Revenue Efficiency (%)',
                'Average Rent'
            ];

            const csvData = analytics.map(item => [
                item._id?.toString() || 'Unknown',
                item.totalBeds || 0,
                item.occupiedBeds || 0,
                (item.totalBeds || 0) - (item.occupiedBeds || 0),
                item.occupancyRate || 0,
                item.currentRevenue || 0,
                item.potentialRevenue || 0,
                item.revenueEfficiency || 0,
                item.avgRent || 0
            ]);

            return this.generateCSV(csvHeaders, csvData, `analytics_${groupBy}_${timeframe}`);

        } catch (error) {
            console.error('Error exporting analytics to CSV:', error);
            throw error;
        }
    }

    // Export activity logs to CSV
    async exportLogsToCSV(filters = {}) {
        try {
            const logs = await AdminLog.find(filters)
                .sort({ timestamp: -1 })
                .limit(10000)
                .lean();

            const csvHeaders = [
                'Log ID',
                'User ID',
                'User Email',
                'Action',
                'Resource',
                'Resource ID',
                'Status',
                'Duration (ms)',
                'IP Address',
                'User Agent',
                'Timestamp'
            ];

            const csvData = logs.map(log => [
                log._id.toString(),
                log.userId?.toString() || '',
                log.userEmail || '',
                log.action || '',
                log.resource || '',
                log.resourceId?.toString() || '',
                log.status || '',
                log.duration || '',
                log.ip || '',
                log.userAgent || '',
                moment(log.timestamp).format('YYYY-MM-DD HH:mm:ss')
            ]);

            return this.generateCSV(csvHeaders, csvData, 'activity_logs');

        } catch (error) {
            console.error('Error exporting logs to CSV:', error);
            throw error;
        }
    }

    // Export occupancy trends to CSV
    async exportOccupancyTrendsToCSV(timeframe = '30d', granularity = 'day') {
        try {
            const trends = await AdminDashboardHelper.getOccupancyTrends(timeframe, granularity);

            const csvHeaders = [
                'Date',
                'Total Beds',
                'Occupied Beds',
                'Vacant Beds',
                'Occupancy Rate (%)'
            ];

            const csvData = trends.map(trend => [
                trend._id || '',
                trend.totalBeds || 0,
                trend.occupiedCount || 0,
                (trend.totalBeds || 0) - (trend.occupiedCount || 0),
                trend.occupancyRate || 0
            ]);

            return this.generateCSV(csvHeaders, csvData, `occupancy_trends_${timeframe}`);

        } catch (error) {
            console.error('Error exporting occupancy trends to CSV:', error);
            throw error;
        }
    }

    // Export property comparison to CSV
    async exportPropertyComparisonToCSV() {
        try {
            const comparison = await AdminDashboardHelper.getPropertyComparison();

            const csvHeaders = [
                'Property ID',
                'Total Rooms',
                'Total Beds',
                'Occupied Beds',
                'Occupancy Rate (%)',
                'Average Rent',
                'Current Revenue',
                'Potential Revenue',
                'Revenue Efficiency (%)',
                'Room Types',
                'Floors'
            ];

            const csvData = comparison.map(property => [
                property._id?.toString() || '',
                property.totalRooms || 0,
                property.totalBeds || 0,
                property.occupiedBeds || 0,
                property.occupancyRate || 0,
                property.avgRent || 0,
                property.currentRevenue || 0,
                property.potentialRevenue || 0,
                property.revenueEfficiency || 0,
                property.roomTypes?.join(', ') || '',
                property.floors?.join(', ') || ''
            ]);

            return this.generateCSV(csvHeaders, csvData, 'property_comparison');

        } catch (error) {
            console.error('Error exporting property comparison to CSV:', error);
            throw error;
        }
    }

    // Generate comprehensive report CSV
    async exportComprehensiveReportToCSV(timeframe = '30d') {
        try {
            const statistics = await AdminDashboardHelper.getRoomStatistics();
            const revenueData = await AdminDashboardHelper.getDetailedRevenue(timeframe);
            const trends = await AdminDashboardHelper.getOccupancyTrends(timeframe);

            // Summary statistics
            const basicStats = statistics.basicStats?.[0] || {};
            const typeDistribution = statistics.typeDistribution || [];
            const statusDistribution = statistics.statusDistribution || [];

            // Create comprehensive summary
            const summaryHeaders = [
                'Metric',
                'Value',
                'Description'
            ];

            const summaryData = [
                ['Total Rooms', basicStats.totalRooms || 0, 'Total number of rooms in the system'],
                ['Total Beds', basicStats.totalBeds || 0, 'Total number of beds across all rooms'],
                ['Average Rent', AdminAnalytics.formatCurrency(basicStats.avgRentPerBed || 0), 'Average rent per bed'],
                ['Min Rent', AdminAnalytics.formatCurrency(basicStats.minRent || 0), 'Minimum rent per bed'],
                ['Max Rent', AdminAnalytics.formatCurrency(basicStats.maxRent || 0), 'Maximum rent per bed'],
                ['Room Types', typeDistribution.length, 'Number of different room types'],
                ['Status Categories', statusDistribution.length, 'Number of different status categories'],
                ['Report Generated', moment().format('YYYY-MM-DD HH:mm:ss'), 'Report generation timestamp'],
                ['Report Period', timeframe, 'Time period for trend analysis']
            ];

            return this.generateCSV(summaryHeaders, summaryData, `comprehensive_report_${timeframe}`);

        } catch (error) {
            console.error('Error exporting comprehensive report to CSV:', error);
            throw error;
        }
    }

    // Generate CSV file from headers and data
    generateCSV(headers, data, filename) {
        try {
            const csvContent = [
                headers.join(','),
                ...data.map(row =>
                    row.map(field => {
                        // Escape fields containing commas or quotes
                        const str = String(field || '');
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return `"${str.replace(/"/g, '""')}"`;
                        }
                        return str;
                    }).join(',')
                )
            ].join('\n');

            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const fileName = `${filename}_${timestamp}.csv`;
            const filePath = path.join(this.exportDir, fileName);

            fs.writeFileSync(filePath, csvContent, 'utf8');

            return {
                success: true,
                fileName,
                filePath,
                size: Buffer.byteLength(csvContent, 'utf8'),
                recordCount: data.length,
                generatedAt: new Date()
            };

        } catch (error) {
            console.error('Error generating CSV file:', error);
            throw error;
        }
    }

    // Get available export files
    getExportFiles() {
        try {
            const files = fs.readdirSync(this.exportDir)
                .filter(file => file.endsWith('.csv'))
                .map(file => {
                    const filePath = path.join(this.exportDir, file);
                    const stats = fs.statSync(filePath);

                    return {
                        fileName: file,
                        filePath,
                        size: stats.size,
                        createdAt: stats.birthtime,
                        modifiedAt: stats.mtime
                    };
                })
                .sort((a, b) => b.createdAt - a.createdAt);

            return files;

        } catch (error) {
            console.error('Error reading export files:', error);
            return [];
        }
    }

    // Clean up old export files
    cleanupOldFiles(daysOld = 7) {
        try {
            const cutoffDate = moment().subtract(daysOld, 'days').toDate();
            const files = this.getExportFiles();

            let deletedCount = 0;

            files.forEach(file => {
                if (file.createdAt < cutoffDate) {
                    try {
                        fs.unlinkSync(file.filePath);
                        deletedCount++;
                    } catch (error) {
                        console.warn(`Failed to delete old export file: ${file.fileName}`, error);
                    }
                }
            });

            console.log(`🧹 Cleaned up ${deletedCount} old export files`);
            return deletedCount;

        } catch (error) {
            console.error('Error cleaning up export files:', error);
            return 0;
        }
    }

    // Get file by filename
    getExportFile(fileName) {
        try {
            const filePath = path.join(this.exportDir, fileName);

            if (!fs.existsSync(filePath)) {
                throw new Error('Export file not found');
            }

            const stats = fs.statSync(filePath);

            return {
                fileName,
                filePath,
                size: stats.size,
                createdAt: stats.birthtime,
                content: fs.readFileSync(filePath, 'utf8')
            };

        } catch (error) {
            console.error('Error reading export file:', error);
            throw error;
        }
    }
}

module.exports = AdminCSVExporter;
