const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false, // Changed from true to false
        default: null    // Allow null for system events
    },
    userEmail: { type: String, required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true }, // room, property, user, etc.
    resourceId: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['success', 'error', 'warning'], default: 'success' },
    duration: { type: Number }, // in milliseconds
    metadata: { type: mongoose.Schema.Types.Mixed }
});

AdminLogSchema.index({ userId: 1, timestamp: -1 });
AdminLogSchema.index({ isSystemEvent: 1, timestamp: -1 });
AdminLogSchema.index({ action: 1, timestamp: -1 });
AdminLogSchema.index({ resource: 1, timestamp: -1 });

const AdminLog = mongoose.model('AdminLog', AdminLogSchema);

class AdminLogger {
    static async log(logData) {
        try {
            // Handle system events
            if (logData.userId === 'system' || !logData.userId) {
                logData.userId = null;
                logData.userEmail = logData.userEmail || 'system';
                logData.isSystemEvent = true;
                logData.systemEventType = logData.systemEventType || 'automated';
            }

            // Validate userId if provided
            if (logData.userId && !mongoose.Types.ObjectId.isValid(logData.userId)) {
                console.warn(`Invalid userId provided to AdminLogger: ${logData.userId}`);
                logData.userId = null;
                logData.isSystemEvent = true;
            }

            const log = new AdminLog(logData);
            await log.save();
            return log;
        } catch (error) {
            console.error('Admin logging error:', error);
            // Don't throw - logging failures shouldn't break the application
        }
    }

    static async logSystemEvent(eventData) {
        return this.log({
            ...eventData,
            userId: null,
            userEmail: 'system',
            isSystemEvent: true,
            systemEventType: eventData.systemEventType || 'automated'
        });
    }

    static createLogMiddleware() {
        return async (req, res, next) => {
            const startTime = Date.now();

            // Store original json method
            const originalJson = res.json;

            // Override json method to capture response
            res.json = function (data) {
                const duration = Date.now() - startTime;

                // Log the admin action
                if (req.user) {
                    AdminLogger.log({
                        userId: req.user._id,
                        userEmail: req.user.email,
                        action: `${req.method} ${req.path}`,
                        resource: AdminLogger.extractResource(req.path),
                        resourceId: req.params.id || req.params.roomId,
                        details: {
                            query: req.query,
                            body: req.method !== 'GET' ? req.body : undefined,
                            params: req.params
                        },
                        ip: req.ip || req.connection.remoteAddress,
                        userAgent: req.get('User-Agent'),
                        status: res.statusCode < 400 ? 'success' : 'error',
                        duration,
                        metadata: {
                            statusCode: res.statusCode,
                            responseSize: JSON.stringify(data).length
                        }
                    });
                }

                // Call original json method
                return originalJson.call(this, data);
            };

            next();
        };
    }

    static extractResource(path) {
        // Extract resource type from URL path
        if (path.includes('/rooms')) return 'room';
        if (path.includes('/properties')) return 'property';
        if (path.includes('/users')) return 'user';
        if (path.includes('/analytics')) return 'analytics';
        if (path.includes('/dashboard')) return 'dashboard';
        if (path.includes('/system')) return 'system';
        return 'other';
    }

    static async getRecentLogs(userId, limit = 50) {
        try {
            const query = userId ? { userId } : {};

            // Include system events if requested
            if (includeSystem && userId) {
                query.$or = [{ userId }, { isSystemEvent: true }];
            } else if (includeSystem && !userId) {
                // Return all logs including system events
            } else if (!includeSystem) {
                query.isSystemEvent = { $ne: true };
            }

            return await AdminLog.find(query)
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();
        } catch (error) {
            console.error('Error fetching admin logs:', error);
            return [];
        }
    } static async getActivitySummary(timeframe = '24h') {
        try {
            const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720; // 30d
            const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

            const rawSummary = await AdminLog.aggregate([
                { $match: { timestamp: { $gte: startTime } } },
                {
                    $group: {
                        _id: {
                            action: '$action',
                            status: '$status'
                        },
                        count: { $sum: 1 },
                        avgDuration: { $avg: '$duration' },
                        users: { $addToSet: '$userId' }
                    }
                },
                {
                    $group: {
                        _id: '$_id.action',
                        totalCount: { $sum: '$count' },
                        successCount: {
                            $sum: {
                                $cond: [{ $eq: ['$_id.status', 'success'] }, '$count', 0]
                            }
                        },
                        errorCount: {
                            $sum: {
                                $cond: [{ $eq: ['$_id.status', 'error'] }, '$count', 0]
                            }
                        },
                        avgDuration: { $avg: '$avgDuration' },
                        uniqueUsers: { $sum: { $size: '$users' } }
                    }
                },
                { $sort: { totalCount: -1 } }
            ]);

            // Calculate summary statistics
            const totalActions = rawSummary.reduce((total, item) => total + item.totalCount, 0);
            const successfulActions = rawSummary.reduce((total, item) => total + item.successCount, 0);
            const errorActions = rawSummary.reduce((total, item) => total + item.errorCount, 0);
            const averageResponseTime = rawSummary.reduce((total, item) => total + (item.avgDuration || 0), 0) / rawSummary.length || 0;

            return {
                totalActions,
                successfulActions,
                errorActions,
                averageResponseTime: Math.round(averageResponseTime),
                detailedBreakdown: rawSummary
            };
        } catch (error) {
            console.error('Error generating activity summary:', error);
            return {
                totalActions: 0,
                successfulActions: 0,
                errorActions: 0,
                averageResponseTime: 0,
                detailedBreakdown: []
            };
        }
    } static async getUserActivity(userId, timeframe = '7d') {
        try {
            const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
            const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            const rawActivity = await AdminLog.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                        timestamp: { $gte: startTime }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$timestamp'
                            }
                        },
                        actions: { $sum: 1 },
                        resources: { $addToSet: '$resource' },
                        avgDuration: { $avg: '$duration' },
                        errors: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'error'] }, 1, 0]
                            }
                        }
                    }
                },
                { $sort: { '_id': 1 } }
            ]);

            // Calculate summary for user activity
            const totalActions = rawActivity.reduce((total, day) => total + day.actions, 0);
            const totalErrors = rawActivity.reduce((total, day) => total + day.errors, 0);
            const allResources = rawActivity.reduce((resources, day) => {
                day.resources.forEach(resource => {
                    if (!resources[resource]) resources[resource] = 0;
                    resources[resource]++;
                });
                return resources;
            }, {});

            return {
                totalActions,
                totalErrors,
                actionsByResource: allResources,
                dailyBreakdown: rawActivity
            };
        } catch (error) {
            console.error('Error fetching user activity:', error);
            return {
                totalActions: 0,
                totalErrors: 0,
                actionsByResource: {},
                dailyBreakdown: []
            };
        }
    }
}

module.exports = { AdminLog, AdminLogger };
