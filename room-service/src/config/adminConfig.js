const adminConfig = {
    // Authentication settings
    auth: {
        requiredRoles: ['admin', 'superadmin'],
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000 // 15 minutes
    },

    // Cache settings
    cache: {
        dashboardTTL: 5 * 60, // 5 minutes
        analyticsTTL: 10 * 60, // 10 minutes
        revenueTTL: 15 * 60, // 15 minutes
        systemHealthTTL: 60, // 1 minute
        propertyTTL: 10 * 60 // 10 minutes
    },

    // Pagination defaults
    pagination: {
        defaultLimit: 20,
        maxLimit: 100,
        defaultPage: 1
    },

    // Rate limiting
    rateLimits: {
        dashboard: {
            windowMs: 60 * 1000, // 1 minute
            max: 60 // 60 requests per minute
        },
        analytics: {
            windowMs: 60 * 1000,
            max: 30 // 30 requests per minute
        },
        bulkOperations: {
            windowMs: 60 * 1000,
            max: 10 // 10 requests per minute
        },
        exports: {
            windowMs: 60 * 1000,
            max: 5 // 5 requests per minute
        }
    },

    // Logging settings
    logging: {
        enableActivityLog: true,
        logRetentionDays: 90,
        logLevels: ['info', 'warn', 'error'],
        excludeActions: ['GET /system/health'], // Actions to exclude from logging
        includeSensitiveData: false
    },

    // Analytics settings
    analytics: {
        defaultTimeframe: '30d',
        maxTimeframe: '1y',
        supportedGroupBy: ['property', 'type', 'floor', 'date'],
        supportedMetrics: ['occupancy', 'revenue', 'growth'],
        enableTrends: true,
        enableComparisons: true
    },

    // Export settings
    export: {
        maxRecords: 10000,
        supportedFormats: ['json', 'csv'],
        allowedTypes: ['rooms', 'analytics', 'logs', 'all'],
        enableScheduled: false,
        compressionThreshold: 1024 * 1024 // 1MB
    },

    // System monitoring
    monitoring: {
        healthCheckInterval: 60 * 1000, // 1 minute
        alertThresholds: {
            dbResponseTime: 1000, // 1 second
            memoryUsage: 80, // 80%
            diskUsage: 90, // 90%
            errorRate: 5 // 5%
        },
        enableAlerts: true
    },

    // Dashboard settings
    dashboard: {
        refreshInterval: 30 * 1000, // 30 seconds
        enableRealtime: true,
        maxWidgets: 20,
        defaultWidgets: [
            'overview',
            'occupancy-chart',
            'revenue-summary',
            'recent-activity'
        ]
    },

    // Security settings
    security: {
        enableIPWhitelist: false,
        allowedIPs: [],
        enableAuditLog: true,
        maskSensitiveData: true,
        requireTwoFactor: false,
        sessionInactivityTimeout: 20 * 60 * 1000 // 20 minutes
    },    // Feature flags
    features: {
        advancedAnalytics: true,
        bulkOperations: true,
        dataExport: true,
        activityTracking: true,
        realtimeDashboard: true,
        customReports: true,
        scheduledReports: true,
        apiKey: false,
        csvExport: true,
        notificationSystem: true
    },

    // Notification settings
    notifications: {
        enableEmail: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
        enableSlack: process.env.ENABLE_SLACK_NOTIFICATIONS === 'true',
        enableWebhook: process.env.ENABLE_WEBHOOK_NOTIFICATIONS === 'true',
        adminEmails: process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [],
        alertChannels: [],
        notificationTypes: [
            'system-error',
            'high-occupancy',
            'low-occupancy',
            'revenue-target',
            'maintenance-required'
        ]
    },

    // Database settings
    database: {
        connectionPoolSize: 10,
        queryTimeout: 30 * 1000, // 30 seconds
        enableSlowQueryLog: true,
        slowQueryThreshold: 1000, // 1 second
        enableIndexHints: true
    },

    // Performance settings
    performance: {
        enableGzip: true,
        enableMinification: false,
        enableCDN: false,
        maxConcurrentRequests: 100,
        requestTimeout: 30 * 1000, // 30 seconds
        enableQueryOptimization: true
    }
};

module.exports = adminConfig;
