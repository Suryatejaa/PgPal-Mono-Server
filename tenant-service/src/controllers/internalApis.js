const axios = require('axios');

// Internal API Error Tracker for Tenant Service
const internalErrorTracker = {
    errors: [],
    requestCount: 0,
    serviceStats: {},

    addError: (error) => {
        const errorEntry = {
            id: `tenant_internal_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
            console.error(`🚨 [TENANT INTERNAL API] CRITICAL ERROR in ${error.sourceService} -> ${error.targetService}`);
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
    sourceService = 'tenant-service'
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
            timeout: 12000, // 12 second timeout for tenant service
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
        console.log(`✅ [TENANT INTERNAL API] ${sourceService} -> ${targetService}: ${method} ${url} (${duration}ms)`);

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
        ? `http://property-service:4002/api/property-service/property-ppid/${propertyId}`
        : `http://property-service:4002/api/property-service/property/${propertyId}`;

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
        'tenant-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getOwnProperty] Failed to get property ${propertyId}:`, result.error);
        return null;
    }
};

const getUserByPhone = async (phone, currentUser) => {
    const url = `http://auth-service:4001/api/auth-service/user?phnum=${phone}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getUserByPhone',
        'auth-service',
        'tenant-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getUserByPhone] Failed to get user by phone ${phone}:`, result.error);
        return null;
    }
};

const changeBedStatus = async (roomId, bedId, status, currentUser) => {
    const url = `http://room-service:4003/api/room-service/rooms/${roomId}/beds/${bedId}/status`;
    const data = { status };
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'PUT',
        url,
        data,
        headers,
        'changeBedStatus',
        'room-service',
        'tenant-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[changeBedStatus] Failed to change bed status ${roomId}/${bedId}:`, result.error);
        return null;
    }
};

const getRoomByNumber = async (propertyId, roomNumber, currentUser) => {
    const url = `http://room-service:4003/api/room-service/${propertyId}/rooms`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getRoomByNumber',
        'room-service',
        'tenant-service'
    );

    if (result.success) {
        const room = result.data.rooms?.find(r => r.roomNumber == roomNumber);
        return room || null;
    } else {
        console.error(`[getRoomByNumber] Failed to get room ${roomNumber} for property ${propertyId}:`, result.error);
        return null;
    }
};

const getUserByPpid = async (ppt, currentUser) => {
    const url = `http://auth-service:4001/api/auth-service/user?ppid=${ppt}`;
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'GET',
        url,
        null,
        headers,
        'getUserByPpid',
        'auth-service',
        'tenant-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[getUserByPpid] Failed to get user by PPID ${ppt}:`, result.error);
        return null;
    }
};

const assignBed = async (roomId, bedId, tenantPhone, rentPerBed, tenantPpt, currentUser) => {
    const url = `http://room-service:4003/api/room-service/rooms/${roomId}/assign-bed`;
    const data = { bedId, phone: tenantPhone, rentPerBed, tenantPpt };
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'PATCH',
        url,
        data,
        headers,
        'assignBed',
        'room-service',
        'tenant-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[assignBed] Failed to assign bed ${roomId}/${bedId} to ${tenantPhone}:`, result.error);
        return null;
    }
};

const clearBed = async (roomId, bedId, currentUser) => {
    const url = `http://room-service:4003/api/room-service/rooms/${roomId}/clear-bed`;
    const data = { bedId };
    const headers = {
        'x-user': JSON.stringify(currentUser)
    };

    const result = await makeInternalApiCall(
        'PATCH',
        url,
        data,
        headers,
        'clearBed',
        'room-service',
        'tenant-service'
    );

    if (result.success) {
        return result.data;
    } else {
        console.error(`[clearBed] Failed to clear bed ${roomId}/${bedId}:`, result.error);
        return result;
    }
};

const sendNotification = async (currentUser, tenantId, title, message, type, method) => {
    const url = 'http://notification-service:4009/api/notification-service';
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
        'tenant-service'
    );

    if (!result.success) {
        console.error(`[sendNotification] Failed to send notification to ${tenantId}:`, result.error);
    }

    return result.success;
};

// Internal API monitoring endpoints
const getInternalApiStats = (req, res) => {
    try {
        const stats = internalErrorTracker.getStats();
        res.json({
            service: 'tenant-service',
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
            service: 'tenant-service',
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
        { name: 'property-service', url: 'http://property-service:4002/api/property-service/health' },
        { name: 'auth-service', url: 'http://auth-service:4001/api/auth-service/health' },
        { name: 'room-service', url: 'http://room-service:4003/api/room-service/health' },
        { name: 'notification-service', url: 'http://notification-service:4009/api/notification-service/health' }
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
                'tenant-service'
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
        service: 'tenant-service',
        timestamp: new Date().toISOString(),
        overallHealth: overallHealth ? 'healthy' : 'degraded',
        dependencies: healthResults,
        internalApiStats: internalErrorTracker.getStats()
    });
};

module.exports = {
    getOwnProperty,
    getUserByPhone,
    getRoomByNumber,
    getUserByPpid,
    assignBed,
    clearBed,
    sendNotification,
    changeBedStatus,

    // Monitoring functions
    makeInternalApiCall,
    getInternalApiStats,
    getInternalApiErrors,
    checkInternalApiHealth,

    // Direct access to tracker for advanced use cases
    internalErrorTracker
};