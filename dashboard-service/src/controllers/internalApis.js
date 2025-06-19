const axios = require('axios');

// Internal API Error Tracker for Dashboard Service
const internalErrorTracker = {
    errors: [],
    requestCount: 0,
    serviceStats: {},

    addError: (error) => {
        const errorEntry = {
            id: `dashboard_internal_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            ...error
        };

        internalErrorTracker.errors.push(errorEntry);

        // Keep only last 500 internal errors
        if (internalErrorTracker.errors.length > 500) {
            internalErrorTracker.errors.shift();
        }

        // Update service stats
        const service = error.targetService;
        if (!internalErrorTracker.serviceStats[service]) {
            internalErrorTracker.serviceStats[service] = {
                requests: 0,
                errors: 0,
                lastError: null
            };
        }
        internalErrorTracker.serviceStats[service].errors++;
        internalErrorTracker.serviceStats[service].lastError = errorEntry;

        // Log critical internal errors
        if (error.status >= 500 || error.timeout) {
            console.error(`🚨 [DASHBOARD INTERNAL API] CRITICAL ERROR in ${error.sourceService} -> ${error.targetService}`);
            console.error(`   Method: ${error.method} ${error.url}`);
            console.error(`   Status: ${error.status || 'TIMEOUT'}`);
            console.error(`   Function: ${error.functionName}`);
            console.error(`   Error: ${error.message}`);
            console.error(`   User: ${error.userId}`);
            console.error(`   Time: ${error.timestamp}`);
        }
    },

    addRequest: (service) => {
        internalErrorTracker.requestCount++;
        if (!internalErrorTracker.serviceStats[service]) {
            internalErrorTracker.serviceStats[service] = {
                requests: 0,
                errors: 0,
                lastError: null
            };
        }
        internalErrorTracker.serviceStats[service].requests++;
    },

    getStats: () => {
        const now = new Date();
        const lastHour = internalErrorTracker.errors.filter(e =>
            now - new Date(e.timestamp) < 60 * 60 * 1000
        );

        const errorsByService = {};
        const errorsByFunction = {};

        internalErrorTracker.errors.forEach(error => {
            errorsByService[error.targetService] = (errorsByService[error.targetService] || 0) + 1;
            errorsByFunction[error.functionName] = (errorsByFunction[error.functionName] || 0) + 1;
        });

        const serviceErrorRates = {};
        Object.entries(internalErrorTracker.serviceStats).forEach(([service, stats]) => {
            serviceErrorRates[service] = {
                errorRate: stats.requests > 0 ? ((stats.errors / stats.requests) * 100).toFixed(2) : 0,
                totalRequests: stats.requests,
                totalErrors: stats.errors,
                lastError: stats.lastError
            };
        });

        return {
            totalErrors: internalErrorTracker.errors.length,
            errorsLastHour: lastHour.length,
            totalRequests: internalErrorTracker.requestCount,
            overallErrorRate: internalErrorTracker.requestCount > 0 ?
                ((internalErrorTracker.errors.length / internalErrorTracker.requestCount) * 100).toFixed(2) : 0,
            errorsByService,
            errorsByFunction,
            serviceErrorRates,
            recentErrors: internalErrorTracker.errors.slice(-5).reverse()
        };
    }
};

// Enhanced internal API call wrapper with monitoring
const makeInternalApiCall = async (
    method,
    url,
    data = null,
    headers = {},
    functionName = 'unknown',
    targetService = 'unknown',
    sourceService = 'dashboard-service'
) => {
    const startTime = Date.now();
    let userId = 'unknown';

    try {
        // Extract user ID from headers if available
        if (headers['x-user']) {
            try {
                const userObj = JSON.parse(headers['x-user']);
                userId = userObj?.data?.user?._id || 'unknown';
            } catch (e) {
                // Ignore parsing errors
            }
        }

        // Track request
        internalErrorTracker.addRequest(targetService);

        // Make the API call
        const config = {
            method: method.toLowerCase(),
            url,
            timeout: 15000, // 15 second timeout for dashboard service (longer due to data aggregation)
            headers: {
                'x-internal-service': true,
                ...headers
            }
        };

        if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
            config.data = data;
        }

        const response = await axios(config);
        const duration = Date.now() - startTime;

        // Log successful call
        console.log(`✅ [DASHBOARD INTERNAL API] ${sourceService} -> ${targetService}: ${method} ${url} (${duration}ms)`);

        return {
            success: true,
            data: response.data,
            status: response.status,
            duration
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        let errorStatus = 500;
        let errorMessage = error.message;
        let isTimeout = false;

        if (error.response) {
            errorStatus = error.response.status;
            errorMessage = error.response.data?.message || error.response.statusText || error.message;
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            isTimeout = true;
            errorMessage = 'Request timeout';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Service unavailable';
        }

        // Track error
        internalErrorTracker.addError({
            sourceService,
            targetService,
            functionName,
            method: method.toUpperCase(),
            url,
            status: errorStatus,
            message: errorMessage,
            duration,
            userId,
            timeout: isTimeout,
            code: error.code,
            requestData: data ? JSON.stringify(data).substring(0, 500) : null
        });

        return {
            success: false,
            error: errorMessage,
            status: errorStatus,
            duration,
            timeout: isTimeout
        };
    }
};

// Enhanced API functions with monitoring
const getOwnProperty = async (propertyId, currentUser, ppid) => {
    const url = ppid
        ? `http://property-service:4002/property-ppid/${propertyId}`
        : `http://property-service:4002/property/${propertyId}`;

    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getOwnProperty',
        'property-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getOwnProperty] Failed to get property ${propertyId}:`, result.error);
        return null;
    }
};

const getTenantConfirmation = async (tenantId, currentUser) => {
    const url = `http://tenant-service:4004/tenants?ppid=${tenantId}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getTenantConfirmation',
        'tenant-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getTenantConfirmation] Failed to get tenant ${tenantId}:`, result.error);
        return null;
    }
};

const getPropertyOwner = async (propertyId, currentUser) => {
    const url = `http://property-service:4002/property-ppid/${propertyId}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getPropertyOwner',
        'property-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getPropertyOwner] Failed to get property owner for ${propertyId}:`, result.error);
        return null;
    }
};

const getTenantDocs = async (propertyId, currentUser) => {
    const url = `http://tenant-service:4004/tenantDocs/${propertyId}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getTenantDocs',
        'tenant-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getTenantDocs] Failed to get tenant docs for property ${propertyId}:`, result.error);
        return null;
    }
};

const getRoomDocs = async (propertyId, currentUser) => {
    const url = `http://room-service:4003/roomDocs/${propertyId}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getRoomDocs',
        'room-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getRoomDocs] Failed to get room docs for property ${propertyId}:`, result.error);
        return null;
    }
};

const getBedDocs = async (propertyId, currentUser) => {
    const url = `http://room-service:4003/bedDocs/${propertyId}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getBedDocs',
        'room-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getBedDocs] Failed to get bed docs for property ${propertyId}:`, result.error);
        return null;
    }
};

const getCheckins = async (propertyId, period, currentUser) => {
    const url = `http://tenant-service:4004/checkins/${propertyId}?period=${period}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getCheckins',
        'tenant-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getCheckins] Failed to get checkins for property ${propertyId}:`, result.error);
        return null;
    }
};

const getVacates = async (propertyId, period, currentUser) => {
    const url = `http://tenant-service:4004/vacates/${propertyId}?period=${period}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getVacates',
        'tenant-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getVacates] Failed to get vacates for property ${propertyId}:`, result.error);
        return null;
    }
};

const getComplaintStats = async (propertyId, currentUser) => {
    const url = `http://complaint-service:4006/metrics/summary/${propertyId}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getComplaintStats',
        'complaint-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getComplaintStats] Failed to get complaint stats for property ${propertyId}:`, result.error);
        return null;
    }
};

// Additional enhanced functions for comprehensive dashboard data
const getPaymentStats = async (propertyId, period, currentUser) => {
    const url = `http://payment-service:4010/stats/${propertyId}?period=${period}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getPaymentStats',
        'payment-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getPaymentStats] Failed to get payment stats for property ${propertyId}:`, result.error);
        return null;
    }
};

const getKitchenStats = async (propertyId, period, currentUser) => {
    const url = `http://kitchen-service:4007/stats/${propertyId}?period=${period}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getKitchenStats',
        'kitchen-service',
        'dashboard-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getKitchenStats] Failed to get kitchen stats for property ${propertyId}:`, result.error);
        return null;
    }
};

// Internal API monitoring endpoints
const getInternalApiStats = (req, res) => {
    try {
        const stats = internalErrorTracker.getStats();
        res.json({
            service: 'dashboard-service',
            timestamp: new Date().toISOString(),
            internalApiStats: stats
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get internal API stats',
            message: error.message
        });
    }
};

const getInternalApiErrors = (req, res) => {
    try {
        const { limit = 50, service, functionName } = req.query;
        let errors = [...internalErrorTracker.errors];

        if (service) {
            errors = errors.filter(e => e.targetService === service);
        }

        if (functionName) {
            errors = errors.filter(e => e.functionName === functionName);
        }

        res.json({
            service: 'dashboard-service',
            errors: errors.slice(-parseInt(limit)).reverse(),
            total: errors.length,
            filters: { service, functionName }
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get internal API errors',
            message: error.message
        });
    }
};

// Health check for internal APIs
const checkInternalApiHealth = async (req, res) => {
    const services = [
        { name: 'property-service', url: 'http://property-service:4002/health' },
        { name: 'tenant-service', url: 'http://tenant-service:4004/health' },
        { name: 'room-service', url: 'http://room-service:4003/health' },
        { name: 'complaint-service', url: 'http://complaint-service:4006/health' },
        { name: 'payment-service', url: 'http://payment-service:4010/health' },
        { name: 'kitchen-service', url: 'http://kitchen-service:4007/health' }
    ];

    const healthResults = {};

    for (const service of services) {
        try {
            const result = await makeInternalApiCall(
                'GET',
                service.url,
                null,
                {},
                'healthCheck',
                service.name,
                'dashboard-service'
            );

            healthResults[service.name] = {
                status: result.success ? 'healthy' : 'unhealthy',
                responseTime: result.duration,
                error: result.success ? null : result.error
            };
        } catch (error) {
            healthResults[service.name] = {
                status: 'unhealthy',
                responseTime: null,
                error: error.message
            };
        }
    }

    const overallHealth = Object.values(healthResults).every(r => r.status === 'healthy');

    res.json({
        service: 'dashboard-service',
        timestamp: new Date().toISOString(),
        overallHealth: overallHealth ? 'healthy' : 'degraded',
        dependencies: healthResults,
        internalApiStats: internalErrorTracker.getStats()
    });
};

// Aggregate dashboard data with error handling
const getAggregatedDashboardData = async (propertyId, period, currentUser) => {
    const results = {};
    const errors = [];

    // Run all API calls in parallel for better performance
    const promises = [
        { key: 'property', promise: getOwnProperty(propertyId, currentUser, true) },
        { key: 'tenants', promise: getTenantDocs(propertyId, currentUser) },
        { key: 'rooms', promise: getRoomDocs(propertyId, currentUser) },
        { key: 'beds', promise: getBedDocs(propertyId, currentUser) },
        { key: 'checkins', promise: getCheckins(propertyId, period, currentUser) },
        { key: 'vacates', promise: getVacates(propertyId, period, currentUser) },
        { key: 'complaints', promise: getComplaintStats(propertyId, currentUser) },
        { key: 'payments', promise: getPaymentStats(propertyId, period, currentUser) },
        { key: 'kitchen', promise: getKitchenStats(propertyId, period, currentUser) }
    ];

    // Execute all promises with individual error handling
    await Promise.allSettled(promises.map(async ({ key, promise }) => {
        try {
            const result = await promise;
            results[key] = result;
        } catch (error) {
            errors.push({ service: key, error: error.message });
            results[key] = null;
        }
    }));

    return {
        data: results,
        errors: errors.length > 0 ? errors : null,
        timestamp: new Date().toISOString(),
        aggregationStats: internalErrorTracker.getStats()
    };
};

module.exports = {
    // Original functions
    getOwnProperty,
    getTenantConfirmation,
    getPropertyOwner,
    getTenantDocs,
    getRoomDocs,
    getBedDocs,
    getCheckins,
    getVacates,
    getComplaintStats,

    // Enhanced functions
    getPaymentStats,
    getKitchenStats,
    getAggregatedDashboardData,

    // Monitoring functions
    makeInternalApiCall,
    getInternalApiStats,
    getInternalApiErrors,
    checkInternalApiHealth,

    // Direct access to tracker for advanced use cases
    internalErrorTracker
};

