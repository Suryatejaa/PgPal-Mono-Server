const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

/**
 * Admin Authentication Middleware
 * Verifies if the user is authenticated and has admin role
 */
const adminAuthMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authorization token is missing'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded._id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token or user not found'
            });
        }

        // Check if user has admin role
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired',
                error: error.message
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Authentication failed',
            error: error.message
        });
    }
};

/**
 * Super Admin Middleware (for critical operations)
 * Could be extended to check for super admin role in the future
 */
const superAdminMiddleware = async (req, res, next) => {
    try {
        // First check if user is admin
        await adminAuthMiddleware(req, res, () => { });

        // Add additional super admin checks here if needed
        // For now, all admins have super admin privileges
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Super admin authentication failed',
            error: error.message
        });
    }
};

/**
 * Permission-based middleware factory
 * @param {string[]} permissions - Array of required permissions
 */
const requirePermissions = (permissions) => {
    return async (req, res, next) => {
        try {
            // First check admin authentication
            await adminAuthMiddleware(req, res, () => { });

            // Check specific permissions (can be extended based on your needs)
            // For now, all authenticated admins have all permissions

            next();
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Permission check failed',
                error: error.message
            });
        }
    };
};

/**
 * Rate limiting middleware for admin operations
 */
const adminRateLimit = (req, res, next) => {
    // Implement rate limiting logic here if needed
    // For now, just pass through
    next();
};

/**
 * Audit log middleware for admin actions
 */
const auditLogger = (action) => {
    return (req, res, next) => {
        // Log admin actions
        const logData = {
            action,
            adminId: req.user?._id,
            adminUsername: req.user?.username,
            timestamp: new Date(),
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            params: req.params,
            query: req.query,
            body: { ...req.body, password: undefined } // Don't log passwords
        };

        console.log('Admin Action:', JSON.stringify(logData, null, 2));

        // Store in audit collection (implement if needed)
        // await AuditLog.create(logData);

        next();
    };
};

module.exports = {
    adminAuthMiddleware,
    superAdminMiddleware,
    requirePermissions,
    adminRateLimit,
    auditLogger
};
