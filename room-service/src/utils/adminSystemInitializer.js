const mongoose = require('mongoose');
const { AdminLog } = require('../utils/adminLogger');
const adminConfig = require('../config/adminConfig');

class AdminSystemInitializer {

    static async initialize() {
        try {
            console.log('🚀 Initializing Admin Dashboard System...');

            // Check database connection
            await this.checkDatabaseConnection();

            // Create necessary indexes
            await this.createIndexes();

            // Initialize cache
            await this.initializeCache();

            // Setup monitoring
            await this.setupMonitoring();

            // Log system startup
            await this.logSystemStartup();

            console.log('✅ Admin Dashboard System initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize Admin Dashboard System:', error);
            throw error;
        }
    }

    static async checkDatabaseConnection() {
        try {
            await mongoose.connection.db.admin().ping();
            console.log('📊 Database connection verified');
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    static async createIndexes() {
        try {
            // Admin log indexes for better query performance
            const AdminLogModel = AdminLog;

            // Compound index for common queries
            await AdminLogModel.collection.createIndex({
                userId: 1,
                timestamp: -1
            });

            await AdminLogModel.collection.createIndex({
                action: 1,
                timestamp: -1
            });

            await AdminLogModel.collection.createIndex({
                resource: 1,
                timestamp: -1
            });

            await AdminLogModel.collection.createIndex({
                status: 1,
                timestamp: -1
            });

            // TTL index for automatic cleanup of old logs
            await AdminLogModel.collection.createIndex(
                { timestamp: 1 },
                {
                    expireAfterSeconds: adminConfig.logging.logRetentionDays * 24 * 60 * 60,
                    name: 'log_retention_ttl'
                }
            );

            console.log('📝 Admin log indexes created');

            // Room collection indexes (if not already exists)
            const Room = require('../models/roomModel');

            await Room.collection.createIndex({ propertyId: 1, status: 1 });
            await Room.collection.createIndex({ type: 1, status: 1 });
            await Room.collection.createIndex({ floor: 1 });
            await Room.collection.createIndex({ rentPerBed: 1 });
            await Room.collection.createIndex({ 'beds.status': 1 });
            await Room.collection.createIndex({ createdAt: -1 });
            await Room.collection.createIndex({ updatedAt: -1 });

            console.log('🏠 Room collection indexes verified');

        } catch (error) {
            console.error('❌ Failed to create indexes:', error);
            // Don't throw error for index creation failures
        }
    }

    static async initializeCache() {
        try {
            const CacheHelper = require('../utils/redis');

            // Test cache connection
            await CacheHelper.ping();

            // Clear any stale admin cache on startup
            const cacheKeys = [
                'admin:dashboard:*',
                'admin:property:*',
                'admin:revenue:*',
                'admin:comprehensive:*',
                'admin:performance:*'
            ];

            for (const pattern of cacheKeys) {
                try {
                    await CacheHelper.deletePattern(pattern);
                } catch (error) {
                    // Pattern deletion might not be supported in all Redis versions
                    console.warn(`Cache pattern deletion not supported: ${pattern}`);
                }
            }

            console.log('💾 Cache system initialized');

        } catch (error) {
            console.warn('⚠️  Cache initialization failed, continuing without cache:', error.message);
        }
    }

    static async setupMonitoring() {
        try {
            // Setup health check intervals if monitoring is enabled
            if (adminConfig.monitoring.enableAlerts) {
                const AdminDashboardHelper = require('../utils/adminDashboardHelper');

                // Check for alerts periodically
                setInterval(async () => {
                    try {
                        const alerts = await AdminDashboardHelper.checkAlertConditions();
                        if (alerts.length > 0) {
                            console.log(`⚠️  ${alerts.length} system alerts detected`);
                            // Here you could integrate with notification systems
                        }
                    } catch (error) {
                        console.error('Alert check failed:', error);
                    }
                }, adminConfig.monitoring.healthCheckInterval);

                console.log('🔍 Monitoring system enabled');
            }

        } catch (error) {
            console.warn('⚠️  Monitoring setup failed:', error.message);
        }
    }

    static async logSystemStartup() {
        try {
            // Create a system startup log entry
            await AdminLog.create({
                userId: new mongoose.Types.ObjectId(), // System user
                userEmail: 'system@pgpaal.com',
                action: 'SYSTEM_STARTUP',
                resource: 'system',
                details: {
                    version: process.env.npm_package_version || '1.0.0',
                    nodeVersion: process.version,
                    environment: process.env.NODE_ENV || 'development',
                    features: adminConfig.features
                },
                status: 'success',
                duration: 0,
                metadata: {
                    serverStartTime: new Date(),
                    memoryUsage: process.memoryUsage(),
                    adminConfigVersion: '1.0.0'
                }
            });

        } catch (error) {
            console.warn('⚠️  System startup logging failed:', error.message);
        }
    }

    static async getSystemInfo() {
        return {
            version: '1.0.0',
            features: adminConfig.features,
            environment: process.env.NODE_ENV || 'development',
            database: {
                connected: mongoose.connection.readyState === 1,
                host: mongoose.connection.host,
                name: mongoose.connection.name
            },
            cache: {
                enabled: true,
                config: adminConfig.cache
            },
            monitoring: {
                enabled: adminConfig.monitoring.enableAlerts,
                healthCheckInterval: adminConfig.monitoring.healthCheckInterval
            },
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            startTime: new Date()
        };
    }

    static async shutdown() {
        try {
            console.log('🔄 Shutting down Admin Dashboard System...');

            // Log system shutdown
            await AdminLog.create({
                userId: new mongoose.Types.ObjectId(),
                userEmail: 'system@pgpaal.com',
                action: 'SYSTEM_SHUTDOWN',
                resource: 'system',
                details: {
                    uptime: process.uptime(),
                    reason: 'graceful_shutdown'
                },
                status: 'success',
                metadata: {
                    shutdownTime: new Date()
                }
            });

            console.log('✅ Admin Dashboard System shutdown complete');

        } catch (error) {
            console.error('❌ Error during admin system shutdown:', error);
        }
    }
}

module.exports = AdminSystemInitializer;
