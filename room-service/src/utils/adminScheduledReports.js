const cron = require('node-cron');
const AdminDashboardHelper = require('./adminDashboardHelper');
const AdminCSVExporter = require('./adminCSVExporter');
const AdminNotificationSystem = require('./adminNotificationSystem');
const AdminAnalytics = require('./adminAnalytics');
const { AdminLogger } = require('./adminLogger');
const adminConfig = require('../config/adminConfig');

class AdminScheduledReports {
    constructor() {
        this.csvExporter = new AdminCSVExporter();
        this.notificationSystem = new AdminNotificationSystem();
        this.scheduledJobs = new Map();

        if (adminConfig.features.scheduledReports) {
            this.initializeScheduledReports();
        }
    }

    // Initialize all scheduled reports
    initializeScheduledReports() {
        console.log('📅 Initializing scheduled admin reports...');

        // Daily summary report - 8:00 AM every day
        this.scheduleJob('daily-summary', '0 8 * * *', () => {
            this.generateDailySummaryReport();
        });

        // Weekly comprehensive report - 9:00 AM every Monday
        this.scheduleJob('weekly-report', '0 9 * * 1', () => {
            this.generateWeeklyReport();
        });

        // Monthly analytics report - 10:00 AM on 1st of every month
        this.scheduleJob('monthly-report', '0 10 1 * *', () => {
            this.generateMonthlyReport();
        });

        // System health check - Every 6 hours
        this.scheduleJob('health-check', '0 */6 * * *', () => {
            this.performSystemHealthCheck();
        });

        // Alert monitoring - Every 30 minutes
        this.scheduleJob('alert-monitoring', '*/30 * * * *', () => {
            this.monitorAlerts();
        });

        // Data cleanup - 2:00 AM every Sunday
        this.scheduleJob('data-cleanup', '0 2 * * 0', () => {
            this.performDataCleanup();
        });

        console.log(`✅ ${this.scheduledJobs.size} scheduled reports initialized`);
    }

    // Schedule a new job
    scheduleJob(name, cronExpression, task) {
        try {
            const job = cron.schedule(cronExpression, async () => {
                console.log(`🔄 Running scheduled task: ${name}`);
                try {
                    await task();
                    console.log(`✅ Completed scheduled task: ${name}`);
                } catch (error) {
                    console.error(`❌ Failed scheduled task: ${name}`, error);
                    // Log the error for admin review
                    await AdminLogger.log({
                        userId: 'system',
                        userEmail: 'system@pgpaal.com',
                        action: `SCHEDULED_TASK_FAILED`,
                        resource: 'scheduler',
                        details: { taskName: name, error: error.message },
                        status: 'error'
                    });
                }
            }, {
                scheduled: false,
                timezone: process.env.TIMEZONE || 'Asia/Kolkata'
            });

            this.scheduledJobs.set(name, {
                job,
                cronExpression,
                task,
                createdAt: new Date(),
                lastRun: null,
                status: 'scheduled'
            });

            job.start();

        } catch (error) {
            console.error(`Failed to schedule job: ${name}`, error);
        }
    }

    // Generate daily summary report
    async generateDailySummaryReport() {
        try {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const stats = await AdminDashboardHelper.getRoomStatistics({
                updatedAt: { $gte: yesterday }
            });

            const basicStats = stats.basicStats?.[0] || {};
            const occupancyStats = stats.bedOccupancy || [];

            const occupiedBeds = occupancyStats.find(s => s._id === 'occupied')?.count || 0;
            const totalBeds = basicStats.totalBeds || 0;
            const occupancyRate = totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(2) : 0;
            const revenue = occupiedBeds * (basicStats.avgRentPerBed || 0);

            const reportData = {
                date: yesterday.toISOString().split('T')[0],
                totalRooms: basicStats.totalRooms || 0,
                totalBeds,
                occupiedBeds,
                occupancyRate: parseFloat(occupancyRate),
                revenue: Math.round(revenue),
                formattedRevenue: AdminAnalytics.formatCurrency(revenue)
            };

            // Generate CSV export
            const csvReport = await this.csvExporter.exportComprehensiveReportToCSV('1d');

            // Send notification
            await this.notificationSystem.sendReport('daily', reportData);

            // Log the report generation
            await AdminLogger.log({
                userId: 'system',
                userEmail: 'system@pgpaal.com',
                action: 'DAILY_REPORT_GENERATED',
                resource: 'report',
                details: { reportData, csvFile: csvReport.fileName },
                status: 'success'
            });

            console.log('📊 Daily summary report generated');
            return reportData;

        } catch (error) {
            console.error('Failed to generate daily summary report:', error);
            throw error;
        }
    }

    // Generate weekly comprehensive report
    async generateWeeklyReport() {
        try {
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Get weekly statistics
            const stats = await AdminDashboardHelper.getRoomStatistics({
                createdAt: { $gte: weekAgo }
            });

            // Get occupancy trends
            const trends = await AdminDashboardHelper.getOccupancyTrends('7d', 'day');

            // Get revenue analytics
            const revenueData = await AdminDashboardHelper.getDetailedRevenue('7d', 'property');

            // Calculate weekly metrics
            const averageOccupancy = trends.reduce((acc, day) => acc + (day.occupancyRate || 0), 0) / trends.length;
            const totalRevenue = revenueData.reduce((acc, prop) => acc + (prop.currentRevenue || 0), 0);
            const newBookings = await this.getNewBookingsCount(weekAgo);

            const reportData = {
                weekStart: weekAgo.toISOString().split('T')[0],
                weekEnd: new Date().toISOString().split('T')[0],
                newBookings,
                averageOccupancy: parseFloat(averageOccupancy.toFixed(2)),
                totalRevenue: Math.round(totalRevenue),
                trendsCount: trends.length,
                propertiesAnalyzed: revenueData.length
            };

            // Generate multiple CSV exports
            const roomsCSV = await this.csvExporter.exportRoomsToCSV({ createdAt: { $gte: weekAgo } });
            const analyticsCSV = await this.csvExporter.exportAnalyticsToCSV('7d', 'property');
            const trendsCSV = await this.csvExporter.exportOccupancyTrendsToCSV('7d', 'day');

            // Send notification
            await this.notificationSystem.sendReport('weekly', reportData);

            // Log the report generation
            await AdminLogger.log({
                userId: 'system',
                userEmail: 'system@pgpaal.com',
                action: 'WEEKLY_REPORT_GENERATED',
                resource: 'report',
                details: {
                    reportData,
                    csvFiles: [roomsCSV.fileName, analyticsCSV.fileName, trendsCSV.fileName]
                },
                status: 'success'
            });

            console.log('📈 Weekly comprehensive report generated');
            return reportData;

        } catch (error) {
            console.error('Failed to generate weekly report:', error);
            throw error;
        }
    }

    // Generate monthly analytics report
    async generateMonthlyReport() {
        try {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);

            // Get comprehensive monthly data
            const stats = await AdminDashboardHelper.getRoomStatistics({
                createdAt: { $gte: monthAgo }
            });

            const propertyComparison = await AdminDashboardHelper.getPropertyComparison();
            const topPerformers = await AdminDashboardHelper.getTopPerformers('revenue', 10);
            const trends = await AdminDashboardHelper.getOccupancyTrends('30d', 'week');

            // Calculate monthly insights
            const monthlyGrowth = await this.calculateMonthlyGrowth(monthAgo);
            const alerts = await AdminDashboardHelper.checkAlertConditions();

            const reportData = {
                month: monthAgo.toISOString().split('T')[0].substring(0, 7),
                properties: propertyComparison.length,
                topPerformers: topPerformers.length,
                weeklyTrends: trends.length,
                alerts: alerts.length,
                monthlyGrowth
            };

            // Generate comprehensive CSV exports
            const propertyCSV = await this.csvExporter.exportPropertyComparisonToCSV();
            const analyticsCSV = await this.csvExporter.exportAnalyticsToCSV('30d', 'property');
            const logsCSV = await this.csvExporter.exportLogsToCSV({
                timestamp: { $gte: monthAgo }
            });

            // Send notification
            await this.notificationSystem.sendReport('monthly', reportData);

            // Log the report generation
            await AdminLogger.log({
                userId: 'system',
                userEmail: 'system@pgpaal.com',
                action: 'MONTHLY_REPORT_GENERATED',
                resource: 'report',
                details: {
                    reportData,
                    csvFiles: [propertyCSV.fileName, analyticsCSV.fileName, logsCSV.fileName]
                },
                status: 'success'
            });

            console.log('📅 Monthly analytics report generated');
            return reportData;

        } catch (error) {
            console.error('Failed to generate monthly report:', error);
            throw error;
        }
    }

    // Perform system health check
    async performSystemHealthCheck() {
        try {
            const mongoose = require('mongoose');
            const CacheHelper = require('./redis');

            const health = {
                database: 'unknown',
                cache: 'unknown',
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                timestamp: new Date()
            };

            // Check database
            try {
                await mongoose.connection.db.admin().ping();
                health.database = 'healthy';
            } catch (error) {
                health.database = 'unhealthy';
            }

            // Check cache
            try {
                await CacheHelper.ping();
                health.cache = 'healthy';
            } catch (error) {
                health.cache = 'unhealthy';
            }

            // Check memory usage
            const memoryUsagePercent = (health.memory.heapUsed / health.memory.heapTotal) * 100;
            if (memoryUsagePercent > 90) {
                health.memoryAlert = 'high';
            }

            // Send notification if issues detected
            const issues = [];
            if (health.database === 'unhealthy') issues.push('Database connection');
            if (health.cache === 'unhealthy') issues.push('Cache connection');
            if (health.memoryAlert) issues.push('High memory usage');

            if (issues.length > 0) {
                await this.notificationSystem.sendSystemStatus('unhealthy', health);
            }

            // Log health check
            await AdminLogger.log({
                userId: 'system',
                userEmail: 'system@pgpaal.com',
                action: 'SYSTEM_HEALTH_CHECK',
                resource: 'system',
                details: health,
                status: issues.length > 0 ? 'warning' : 'success'
            });

        } catch (error) {
            console.error('System health check failed:', error);
        }
    }

    // Monitor and send alerts
    async monitorAlerts() {
        try {
            const alerts = await AdminDashboardHelper.checkAlertConditions();

            // Send notifications for critical alerts
            for (const alert of alerts) {
                if (alert.severity === 'error' || alert.severity === 'warning') {
                    await this.notificationSystem.sendAlert(alert, alert.severity === 'error' ? 'high' : 'medium');
                }
            }

            if (alerts.length > 0) {
                console.log(`⚠️  ${alerts.length} alerts processed`);
            }

        } catch (error) {
            console.error('Alert monitoring failed:', error);
        }
    }

    // Perform data cleanup
    async performDataCleanup() {
        try {
            let cleanupCount = 0;

            // Clean up old CSV exports
            cleanupCount += this.csvExporter.cleanupOldFiles(30);

            // Clean up old admin logs (keep 90 days)
            const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const logCleanup = await AdminLogger.cleanupOldLogs(cutoffDate);
            cleanupCount += logCleanup;

            // Log cleanup activity
            await AdminLogger.log({
                userId: 'system',
                userEmail: 'system@pgpaal.com',
                action: 'DATA_CLEANUP',
                resource: 'system',
                details: { itemsDeleted: cleanupCount },
                status: 'success'
            });

            console.log(`🧹 Data cleanup completed: ${cleanupCount} items removed`);

        } catch (error) {
            console.error('Data cleanup failed:', error);
        }
    }

    // Helper method to get new bookings count
    async getNewBookingsCount(since) {
        try {
            const Room = require('../models/roomModel');
            return await Room.countDocuments({
                'beds.status': 'occupied',
                'beds.updatedAt': { $gte: since }
            });
        } catch (error) {
            console.warn('Could not get new bookings count:', error);
            return 0;
        }
    }

    // Helper method to calculate monthly growth
    async calculateMonthlyGrowth(monthAgo) {
        try {
            const Room = require('../models/roomModel');

            const currentMonthRooms = await Room.countDocuments({
                createdAt: { $gte: monthAgo }
            });

            const previousMonthStart = new Date(monthAgo);
            previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

            const previousMonthRooms = await Room.countDocuments({
                createdAt: {
                    $gte: previousMonthStart,
                    $lt: monthAgo
                }
            });

            const growth = previousMonthRooms > 0 ?
                ((currentMonthRooms - previousMonthRooms) / previousMonthRooms * 100).toFixed(2) : 0;

            return {
                currentMonth: currentMonthRooms,
                previousMonth: previousMonthRooms,
                growthPercent: parseFloat(growth)
            };

        } catch (error) {
            console.warn('Could not calculate monthly growth:', error);
            return { currentMonth: 0, previousMonth: 0, growthPercent: 0 };
        }
    }

    // Get scheduled job status
    getJobStatus() {
        const status = {};

        for (const [name, jobInfo] of this.scheduledJobs) {
            status[name] = {
                cronExpression: jobInfo.cronExpression,
                status: jobInfo.status,
                createdAt: jobInfo.createdAt,
                lastRun: jobInfo.lastRun,
                isRunning: jobInfo.job ? jobInfo.job.running : false
            };
        }

        return status;
    }

    // Stop all scheduled jobs
    stopAllJobs() {
        for (const [name, jobInfo] of this.scheduledJobs) {
            if (jobInfo.job) {
                jobInfo.job.stop();
                console.log(`⏹️  Stopped scheduled job: ${name}`);
            }
        }
    }

    // Test report generation
    async testReportGeneration() {
        try {
            console.log('🧪 Testing report generation...');

            const testReport = await this.generateDailySummaryReport();
            console.log('✅ Test report generated successfully:', testReport);

            return testReport;

        } catch (error) {
            console.error('❌ Test report generation failed:', error);
            throw error;
        }
    }
}

module.exports = AdminScheduledReports;
