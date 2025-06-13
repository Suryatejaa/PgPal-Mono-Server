// Admin Authentication Middleware
// Provides role-based access control for admin dashboard

/**
 * Admin Authentication Middleware
 * Validates admin access with role-based permissions
 */
const validateAdminAccess = (requiredLevel = 'admin') => {
    return (req, res, next) => {
        try {
            const currentUser = JSON.parse(req.headers['x-user'] || '{}');

            if (!currentUser || !currentUser.data?.user) {
                return res.status(401).json({
                    error: 'Unauthorized: Admin access required',
                    code: 'ADMIN_AUTH_REQUIRED'
                });
            }

            const user = currentUser.data.user;
            const userRole = user.role;
            const adminLevel = user.adminLevel || 'none';

            // Check for admin or super admin access
            if (userRole !== 'admin' && userRole !== 'super_admin' && adminLevel === 'none') {
                return res.status(403).json({
                    error: 'Forbidden: Admin privileges required',
                    code: 'INSUFFICIENT_PRIVILEGES',
                    userRole,
                    requiredLevel
                });
            }

            // Super admin check for sensitive operations
            if (requiredLevel === 'super_admin' && userRole !== 'super_admin' && adminLevel !== 'super_admin') {
                return res.status(403).json({
                    error: 'Forbidden: Super admin privileges required',
                    code: 'SUPER_ADMIN_REQUIRED',
                    userRole,
                    adminLevel
                });
            }

            // Log admin access for audit trail
            console.log(`Admin access: ${user.email} (${userRole}/${adminLevel}) accessed ${req.method} ${req.path}`);

            req.adminUser = user;
            next();
        } catch (error) {
            console.error('Admin authentication error:', error);
            return res.status(500).json({
                error: 'Authentication service error',
                code: 'AUTH_SERVICE_ERROR'
            });
        }
    };
};

/**
 * Rate limiting for admin operations
 */
const adminRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
    const requests = new Map();

    return (req, res, next) => {
        const userId = req.adminUser?.id;
        if (!userId) {
            return next();
        }

        const now = Date.now();
        const userRequests = requests.get(userId) || [];

        // Clean old requests
        const validRequests = userRequests.filter(time => now - time < windowMs);

        if (validRequests.length >= maxRequests) {
            return res.status(429).json({
                error: 'Too many admin requests',
                code: 'ADMIN_RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        validRequests.push(now);
        requests.set(userId, validRequests);

        next();
    };
};

/**
 * Audit logging middleware for admin actions
 */
const auditLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function (data) {
        const duration = Date.now() - startTime;
        const adminUser = req.adminUser;

        // Log admin action
        const auditLog = {
            timestamp: new Date().toISOString(),
            adminUser: {
                id: adminUser?.id,
                email: adminUser?.email,
                role: adminUser?.role,
                adminLevel: adminUser?.adminLevel
            },
            action: {
                method: req.method,
                path: req.path,
                query: req.query,
                body: req.method !== 'GET' ? req.body : undefined,
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent')
            },
            response: {
                statusCode: res.statusCode,
                duration: `${duration}ms`
            }
        };

        // In production, this should go to a dedicated audit log system
        console.log('Admin Audit Log:', JSON.stringify(auditLog, null, 2));

        originalSend.call(this, data);
    };

    next();
};

module.exports = {
    validateAdminAccess,
    adminRateLimit,
    auditLogger
};
