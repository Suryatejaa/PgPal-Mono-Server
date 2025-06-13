# Admin Dashboard API Documentation

## Overview

This is a comprehensive admin dashboard backend for the PGPaal Auth Service. It provides full administrative controls for managing users, monitoring system health, analytics, and administrative operations.

## Features

### 🔐 **Authentication & Authorization**

- Role-based access control with admin role
- Secure JWT token validation
- Admin middleware with audit logging
- Super admin permissions for critical operations

### 👥 **User Management**

- View all users with pagination and filtering
- Search users by username, email, phone, or PGPaal ID
- Update user details and status
- Delete users with audit trail
- Bulk operations (verify, unverify, delete, update subscriptions)
- Export user data in JSON or CSV format

### 📊 **Analytics & Monitoring**

- Real-time dashboard statistics
- User registration trends
- Subscription analytics
- System health monitoring
- Database integrity checks

### 🔧 **System Administration**

- Cache management (clear specific patterns or all cache)
- System health monitoring
- Database optimization
- Configuration management
- Maintenance notifications

### 📧 **Notification Management**

- Send bulk notifications to all users, owners, tenants, or specific users
- Multiple notification methods (in-app, email)
- Maintenance announcements

### 🛠 **Advanced Tools**

- Cleanup inactive users
- Database integrity checks
- System reports generation
- Audit trail logging
- Security operations (revoke tokens, force password reset)

## API Endpoints

### Authentication

```
POST /api/auth-service/admin/auth/create-admin
```

Create a new admin user (Super Admin only)

### Dashboard & Analytics

```
GET /api/auth-service/admin/dashboard/stats
GET /api/auth-service/admin/analytics/registration-trends
GET /api/auth-service/admin/analytics/user-activity
```

### User Management

```
GET /api/auth-service/admin/users
GET /api/auth-service/admin/users/:userId
PUT /api/auth-service/admin/users/:userId
DELETE /api/auth-service/admin/users/:userId
POST /api/auth-service/admin/users/bulk
```

### System Management

```
GET /api/auth-service/admin/system/health
GET /api/auth-service/admin/system/report
GET /api/auth-service/admin/system/integrity-check
POST /api/auth-service/admin/system/cleanup
POST /api/auth-service/admin/database/optimize
GET /api/auth-service/admin/config/system
```

### Cache Management

```
POST /api/auth-service/admin/cache/manage
```

### Notifications

```
POST /api/auth-service/admin/notifications/bulk-send
POST /api/auth-service/admin/notifications/maintenance
```

### Security Operations

```
POST /api/auth-service/admin/security/revoke-tokens
POST /api/auth-service/admin/security/force-password-reset
```

### Data Export

```
GET /api/auth-service/admin/export/users
```

## Usage Examples

### 1. Get Dashboard Statistics

```bash
curl -X GET "http://localhost:4001/api/auth-service/admin/dashboard/stats" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 2. Get All Users with Filters

```bash
curl -X GET "http://localhost:4001/api/auth-service/admin/users?page=1&limit=20&role=tenant&verified=true&search=john" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 3. Update User

```bash
curl -X PUT "http://localhost:4001/api/auth-service/admin/users/USER_ID" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isVerified": true,
    "subscriptionStatus": {
      "plan": "professional",
      "status": "active"
    }
  }'
```

### 4. Bulk User Operations

```bash
curl -X POST "http://localhost:4001/api/auth-service/admin/users/bulk" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "verify",
    "userIds": ["USER_ID_1", "USER_ID_2"]
  }'
```

### 5. Send Bulk Notification

```bash
curl -X POST "http://localhost:4001/api/auth-service/admin/notifications/bulk-send" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "System Update",
    "message": "We will be performing maintenance on our servers tonight.",
    "audience": "all",
    "type": "info",
    "method": ["in-app", "email"]
  }'
```

### 6. Cache Management

```bash
curl -X POST "http://localhost:4001/api/auth-service/admin/cache/manage" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "clear_user_caches"
  }'
```

### 7. Export Users Data

```bash
# JSON format
curl -X GET "http://localhost:4001/api/auth-service/admin/export/users?format=json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# CSV format
curl -X GET "http://localhost:4001/api/auth-service/admin/export/users?format=csv" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 8. System Health Check

```bash
curl -X GET "http://localhost:4001/api/auth-service/admin/system/health" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Authentication Setup

### 1. Create First Admin User

You need to create the first admin user directly in the database or modify the user model temporarily:

```javascript
// In MongoDB shell or through your application
db.users.updateOne({ email: "admin@pgpaal.com" }, { $set: { role: "admin" } });
```

### 2. Login as Admin

Use the regular login endpoint with admin credentials:

```bash
curl -X POST "http://localhost:4001/api/auth-service/login" \
  -H "Content-Type: application/json" \
  -d '{
    "credential": "admin@pgpaal.com",
    "password": "your_admin_password",
    "role": "admin"
  }'
```

### 3. Use Admin Token

Include the received token in all admin API requests:

```
Authorization: Bearer YOUR_ADMIN_JWT_TOKEN
```

## Security Features

### 1. Role-Based Access Control

- Only users with `role: "admin"` can access admin endpoints
- Super admin operations require additional verification
- Audit logging for all admin actions

### 2. Input Validation

- Comprehensive validation for all admin operations
- Sanitization of user inputs
- Protection against injection attacks

### 3. Rate Limiting

- Rate limiting can be implemented for admin operations
- Currently configured to allow normal admin usage

### 4. Audit Trail

- All admin actions are logged with:
  - Action performed
  - Admin user details
  - Timestamp
  - IP address and user agent
  - Request parameters and body

## Error Handling

All admin endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

Common HTTP status codes:

- `200` - Success
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## Monitoring & Logging

### 1. Audit Logs

All admin actions are logged to the console and can be extended to store in a database collection.

### 2. System Health

Regular health checks for:

- Database connectivity
- Redis cache status
- Memory usage
- System uptime

### 3. Performance Monitoring

- Response time tracking
- Error rate monitoring
- Resource usage monitoring

## Cache Strategy

The admin dashboard uses intelligent caching:

- Dashboard stats cached for 5 minutes
- System health cached for 1 minute
- User data caches are invalidated on updates
- Pattern-based cache invalidation

## Best Practices

### 1. Security

- Always use HTTPS in production
- Implement proper CORS policies
- Use environment variables for sensitive data
- Regular security audits

### 2. Performance

- Use pagination for large datasets
- Implement proper indexing
- Cache frequently accessed data
- Monitor database performance

### 3. Maintenance

- Regular cleanup of inactive users
- Database integrity checks
- Performance monitoring
- Backup strategies

## Environment Variables

Required environment variables:

```
JWT_SECRET=your_jwt_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
MONGO_URI=your_mongodb_connection_string
REDIS=your_redis_connection_string
EMAIL=your_email_for_notifications
EMAIL_PASSWORD=your_email_password
```

## Contributing

When adding new admin features:

1. Add proper authentication middleware
2. Implement input validation
3. Add audit logging
4. Update documentation
5. Test thoroughly

## Support

For issues or feature requests related to the admin dashboard, please contact the development team or create an issue in the project repository.
