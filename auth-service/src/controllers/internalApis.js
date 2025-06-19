const axios = require('axios');

// Internal API Error Tracker
const internalErrorTracker = {
    errors: [],
    requestCount: 0,
    serviceStats: {},

    addError: (error) => {
        const errorEntry = {
            id: `internal_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
            console.error(`🚨 [INTERNAL API] CRITICAL ERROR in ${error.sourceService} -> ${error.targetService}`);
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
    sourceService = 'auth-service'
) => {
    const startTime = Date.now();
    let userId = 'unknown';

    try {
        // Extract user ID from headers
        if (headers['x-user']) {
            try {
                const userObj = JSON.parse(headers['x-user']);
                userId = userObj?.data?.user?._id || userObj?.user?._id || userObj?._id || 'unknown';
            } catch (e) {
                console.warn('⚠️ [makeInternalApiCall] Failed to parse x-user header:', e.message);
            }
        }

        internalErrorTracker.addRequest(targetService);

        // Make the API call
        const config = {
            method: method.toLowerCase(),
            url,
            timeout: 10000,
            headers: {
                'x-internal-service': true,
                ...headers
            },
            // ✅ NEW: Add detailed error handling via axios settings
            validateStatus: null // Allow all status codes to be processed
        };

        if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
            config.data = data;
        }

        const response = await axios(config);
        const duration = Date.now() - startTime;

        if (response.status >= 400) {
            // ✅ NEW: Detailed error handling for non-200 responses
            const errorData = response.data || {};
            const errorMessage = errorData.error || errorData.message || response.statusText || 'Unknown error';
            const errorDetails = errorData.details || errorData.stack || null;

            console.error(`❌ [${sourceService}->${targetService}] HTTP ${response.status} error in ${functionName}:`, {
                message: errorMessage,
                details: errorDetails,
                data: errorData,
                url,
                method: config.method.toUpperCase(),
                userId,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });

            // Track the error with full details
            internalErrorTracker.addError({
                sourceService,
                targetService,
                functionName,
                method: config.method.toUpperCase(),
                url,
                status: response.status,
                message: errorMessage,
                details: errorDetails,
                rawResponse: JSON.stringify(errorData).substring(0, 1000),
                duration,
                userId,
                timestamp: new Date().toISOString()
            });

            return {
                success: false,
                error: errorMessage,
                details: errorDetails,
                rawError: errorData,
                status: response.status,
                duration
            };
        }

        console.log(`✅ [INTERNAL API] ${sourceService} -> ${targetService}: ${method} ${url} (${duration}ms)`);

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
        let errorDetails = null;
        let isTimeout = false;

        if (error.response) {
            // ✅ NEW: Detailed error extraction from responses
            errorStatus = error.response.status;
            const errorData = error.response.data || {};
            errorMessage = errorData.error || errorData.message || error.response.statusText || error.message;
            errorDetails = errorData.details || errorData.stack || error.stack;

            // ✅ NEW: Print the full response data for debugging
            console.error(`🔎 [${sourceService}->${targetService}] Detailed error response:`, {
                data: JSON.stringify(errorData).substring(0, 1000),
                headers: error.response.headers,
                status: error.response.status
            });
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            isTimeout = true;
            errorMessage = 'Request timeout';
            errorDetails = `Service ${targetService} did not respond within ${config.timeout}ms`;
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Service unavailable';
            errorDetails = `Unable to connect to ${targetService} - service may be down or unreachable`;
        }

        // ✅ Enhanced error tracking with more details
        const errorEntry = {
            sourceService,
            targetService,
            functionName,
            method: method.toUpperCase(),
            url,
            status: errorStatus,
            message: errorMessage,
            details: errorDetails,
            code: error.code,
            stack: error.stack,
            duration,
            userId,
            timeout: isTimeout,
            timestamp: new Date().toISOString(),
            requestData: data ? JSON.stringify(data).substring(0, 500) : null
        };

        internalErrorTracker.addError(errorEntry);

        // ✅ NEW: Enhanced error logging with more context and details
        console.error(`🚨 [INTERNAL API] CRITICAL ERROR in ${sourceService} -> ${targetService}`);
        console.error(`   Method: ${method.toUpperCase()} ${url}`);
        console.error(`   Status: ${errorStatus}`);
        console.error(`   Function: ${functionName}`);
        console.error(`   Error: ${errorMessage}`);
        console.error(`   Details: ${errorDetails || 'No details available'}`);
        console.error(`   Code: ${error.code || 'No error code'}`);
        console.error(`   Stack: ${error.stack ? error.stack.split('\n').slice(0, 3).join('\n       ') : 'No stack trace'}`);
        console.error(`   User: ${userId}`);
        console.error(`   Time: ${errorEntry.timestamp}`);

        return {
            success: false,
            error: errorMessage,
            details: errorDetails,
            stack: error.stack,
            code: error.code,
            status: errorStatus,
            duration,
            timeout: isTimeout
        };
    }
};

const updateMaxRoomsnBeds = async (currentUser, properties, currentPlan) => {
    const results = [];

    for (const property of properties) {
        const url = `http://property-service:4002/property/${property.id}/updateMaxRoomsnBeds`;
        const headers = {
            'x-user': JSON.stringify(currentUser),
            'x-internal-service': true
        };
        const data = {
            currentPlan
        };

        const result = await makeInternalApiCall(
            'PUT',
            url,
            data,
            headers,
            'updateMaxRoomsnBeds',
            'property-service',
            'auth-service' // Fix: should be 'auth-service', not 'complaint-service'
        );

        if (result.success) {
            console.log(`✅ [updateMaxRoomsnBeds] Updated property ${property.id} (${property.name})`);
            results.push({
                propertyId: property.id,
                propertyName: property.name,
                success: true,
                data: result.data
            });
        } else {
            console.error(`❌ [updateMaxRoomsnBeds] Failed to update property ${property.id} (${property.name}):`, result.error);
            results.push({
                propertyId: property.id,
                propertyName: property.name,
                success: false,
                error: result.error
            });
        }
    }

    // Return summary of all updates
    const successCount = results.filter(r => r.success).length;
    return {
        success: successCount > 0,
        totalProperties: properties.length,
        successfulUpdates: successCount,
        failedUpdates: properties.length - successCount,
        results
    };
};

const getMyProperties = async (currentUser) => {
    // Extract user ID correctly
    const userId = currentUser?.data?.user?._id || currentUser?._id;

    if (!userId) {
        console.error('❌ [getMyProperties] Missing user ID in currentUser object');
        return {
            success: false,
            error: 'Invalid user data - missing user ID',
            data: []
        };
    }

    console.log(`🔍 [getMyProperties] Fetching properties for user ${userId}`);

    const result = await makeInternalApiCall(
        'GET',
        'http://property-service:4002/own',
        null,
        {
            'x-user': JSON.stringify(currentUser),
            'x-internal-service': true,
            'x-debug': 'true' // Add debug header
        },
        'getMyProperties',
        'property-service',
        'auth-service'
    );

    if (result.success) {
        const properties = result.data || [];
        console.log(`✅ [getMyProperties] Found ${properties.length} properties for user ${userId}`);

        return {
            success: true,
            data: properties.map(property => ({
                id: property._id,
                ppid: property.pgpalId,
                name: property.name
            }))
        };
    } else {
        // ✅ Enhanced error logging with more details
        console.error(`❌ [getMyProperties] Failed to get properties for user ${userId}:`, {
            error: result.error,
            details: result.details || 'No additional details',
            stack: result.stack ? result.stack.split('\n').slice(0, 3) : 'No stack trace',
            code: result.code,
            status: result.status
        });

        return {
            success: false,
            error: result.error,
            details: result.details,
            data: []
        };
    }
};

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
        'complaint-service'
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
        'complaint-service'
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
        'complaint-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getPropertyOwner] Failed to get property owner for ${propertyId}:`, result.error);
        return null;
    }
};

const sendNotification = async (currentUser, tenantId, title, message, type, method) => {
    const url = 'http://notification-service:4009';
    const data = {
        tenantId,
        title,
        message,
        type,
        method,
        createdBy: 'system'
    };
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'POST',
        url,
        data,
        headers,
        'sendNotification',
        'notification-service',
        'complaint-service'
    );

    if (!result.success) {
        console.error(`[sendNotification] Failed to send notification to ${tenantId}:`, result.error);
    }

    return result.success;
};

// Internal API monitoring endpoints (add these to your complaint service routes)
const getInternalApiStats = (req, res) => {
    try {
        const stats = internalErrorTracker.getStats();
        res.json({
            service: 'complaint-service',
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
            service: 'complaint-service',
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
        { name: 'notification-service', url: 'http://notification-service:4009/health' }
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
                'complaint-service'
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
        service: 'complaint-service',
        timestamp: new Date().toISOString(),
        overallHealth: overallHealth ? 'healthy' : 'degraded',
        dependencies: healthResults,
        internalApiStats: internalErrorTracker.getStats()
    });
};

module.exports = {
    getOwnProperty,
    getTenantConfirmation,
    getPropertyOwner,
    sendNotification,
    getMyProperties,
    updateMaxRoomsnBeds,

    // Monitoring functions
    makeInternalApiCall,
    getInternalApiStats,
    getInternalApiErrors,
    checkInternalApiHealth,

    // Direct access to tracker for advanced use cases
    internalErrorTracker
};

